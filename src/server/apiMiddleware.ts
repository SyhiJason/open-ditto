import type { IncomingMessage, ServerResponse } from "node:http";
import OpenAI from "openai";
import { listSessionEvents } from "./db";
import {
  subscribeSessionEvents,
  writeSseEvent,
  writeSseInfo,
} from "./eventBus";
import { OpenDittoRuntime } from "./runtime";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function writeJson(res: ServerResponse, statusCode: number, data: JsonValue): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

function parsePath(req: IncomingMessage & { originalUrl?: string }): string {
  const full = req.originalUrl ?? req.url ?? "";
  return full.split("?")[0] || "";
}

function parseQuery(req: IncomingMessage & { originalUrl?: string }): URLSearchParams {
  const full = req.originalUrl ?? req.url ?? "";
  const query = full.includes("?") ? full.slice(full.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
}

export function createOpenDittoApiMiddleware(apiKey: string | undefined) {
  const runtime = new OpenDittoRuntime();
  const moonshotClient = apiKey
    ? new OpenAI({
        apiKey,
        baseURL: "https://api.moonshot.cn/v1",
      })
    : null;

  return async function handler(
    req: IncomingMessage & { originalUrl?: string },
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const pathname = parsePath(req);

    if (!pathname.startsWith("/api/")) {
      next();
      return;
    }

    if (pathname === "/api/ai/chat") {
      if (req.method !== "POST") {
        writeJson(res, 405, { error: "Method not allowed" });
        return;
      }

      if (!moonshotClient) {
        writeJson(res, 500, { error: "MOONSHOT_API_KEY is not configured on the server." });
        return;
      }

      try {
        const body = await readJsonBody(req);
        const model = typeof body.model === "string" ? body.model : "moonshot-v1-8k";
        const rawMessages = Array.isArray(body.messages) ? body.messages : [];
        const messages = rawMessages
          .filter((message) => message && typeof message === "object")
          .map((message) => message as Record<string, unknown>)
          .filter(
            (message) =>
              (message.role === "system" || message.role === "user" || message.role === "assistant") &&
              typeof message.content === "string"
          )
          .map((message) => ({
            role: message.role as "system" | "user" | "assistant",
            content: message.content as string,
          }));

        if (messages.length === 0) {
          writeJson(res, 400, { error: "messages must contain at least one valid item." });
          return;
        }

        const completion = await moonshotClient.chat.completions.create({
          model,
          messages,
        });

        const content = completion.choices[0]?.message?.content;
        const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
        writeJson(res, 200, { content: text });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown server error";
        writeJson(res, 500, { error: message });
      }
      return;
    }

    try {
      if (pathname === "/api/onboarding/start" && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.onboardingStart({
          user_id: typeof body.user_id === "string" ? body.user_id : undefined,
          profile: (body.profile ?? {}) as Record<string, unknown>,
          candidate_pool: body.candidate_pool,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      const onboardingChatMatch = pathname.match(/^\/api\/onboarding\/([^/]+)\/chat$/);
      if (onboardingChatMatch && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.onboardingChat({
          session_id: onboardingChatMatch[1],
          message: typeof body.message === "string" ? body.message : "",
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      if (pathname === "/api/match/run" && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.runMatchGraph({
          session_id: String(body.session_id ?? ""),
          candidate_pool: body.candidate_pool,
          top_k: Number(body.top_k ?? 5),
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      if (pathname === "/api/match/swipe" && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.persistSwipe({
          session_id: String(body.session_id ?? ""),
          candidate_id: String(body.candidate_id ?? ""),
          action: body.action === "right" ? "right" : "left",
          reject_reason_tag:
            typeof body.reject_reason_tag === "string" ? body.reject_reason_tag : undefined,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      if (pathname === "/api/negotiation/start" && req.method === "POST") {
        const body = await readJsonBody(req);

        const availableSlots = Array.isArray(body.available_slots)
          ? body.available_slots
              .filter((slot) => slot && typeof slot === "object")
              .map((slot) => slot as Record<string, unknown>)
              .map((slot) => ({
                day: String(slot.day ?? ""),
                date: String(slot.date ?? ""),
                start: String(slot.start ?? ""),
                end: String(slot.end ?? ""),
                label: String(slot.label ?? ""),
              }))
          : undefined;

        const result = runtime.startNegotiation({
          session_id: String(body.session_id ?? ""),
          candidate_id: String(body.candidate_id ?? ""),
          available_slots: availableSlots,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      const overrideMatch = pathname.match(/^\/api\/negotiation\/([^/]+)\/override$/);
      if (overrideMatch && req.method === "POST") {
        const body = await readJsonBody(req);
        const action =
          body.action === "approve" || body.action === "reject" || body.action === "replan"
            ? body.action
            : undefined;
        const result = runtime.negotiationOverride({
          negotiation_id: overrideMatch[1],
          session_id: String(body.session_id ?? ""),
          instruction: String(body.instruction ?? ""),
          actor: typeof body.actor === "string" ? body.actor : undefined,
          action,
          overrides:
            body.overrides && typeof body.overrides === "object"
              ? {
                  venue:
                    typeof (body.overrides as Record<string, unknown>).venue === "string"
                      ? String((body.overrides as Record<string, unknown>).venue)
                      : undefined,
                  date:
                    typeof (body.overrides as Record<string, unknown>).date === "string"
                      ? String((body.overrides as Record<string, unknown>).date)
                      : undefined,
                  time:
                    typeof (body.overrides as Record<string, unknown>).time === "string"
                      ? String((body.overrides as Record<string, unknown>).time)
                      : undefined,
                  notes:
                    typeof (body.overrides as Record<string, unknown>).notes === "string"
                      ? String((body.overrides as Record<string, unknown>).notes)
                      : undefined,
                }
              : undefined,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      const dateConfirmMatch = pathname.match(/^\/api\/date\/([^/]+)\/confirm$/);
      if (dateConfirmMatch && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.confirmDate({
          date_plan_id: dateConfirmMatch[1],
          session_id: String(body.session_id ?? ""),
          confirm: Boolean(body.confirm),
          actor: typeof body.actor === "string" ? body.actor : undefined,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      if (pathname === "/api/post-date/feedback" && req.method === "POST") {
        const body = await readJsonBody(req);
        const result = runtime.postDateFeedback({
          session_id: String(body.session_id ?? ""),
          candidate_id: String(body.candidate_id ?? ""),
          attended: Boolean(body.attended),
          feedback: String(body.feedback ?? ""),
          cancel_reason: typeof body.cancel_reason === "string" ? body.cancel_reason : undefined,
        });
        writeJson(res, 200, result as unknown as JsonValue);
        return;
      }

      const sessionEventsMatch = pathname.match(/^\/api\/session\/([^/]+)\/events$/);
      if (sessionEventsMatch && req.method === "GET") {
        const sessionId = sessionEventsMatch[1];
        const query = parseQuery(req);
        const afterFromQuery = Number(query.get("after") ?? 0);
        const lastEventIdHeader = Number(req.headers["last-event-id"] ?? 0);
        const afterId = Number.isFinite(afterFromQuery) && afterFromQuery > 0
          ? afterFromQuery
          : Number.isFinite(lastEventIdHeader)
            ? lastEventIdHeader
            : 0;

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.write("retry: 3000\n\n");

        const replayEvents = listSessionEvents(sessionId, { afterId, limit: 500 });
        for (const event of replayEvents) {
          writeSseEvent(res, event);
        }

        writeSseInfo(res, "ready", { session_id: sessionId, replayed: replayEvents.length });

        const unsubscribe = subscribeSessionEvents(sessionId, res);
        const heartbeat = setInterval(() => {
          writeSseInfo(res, "heartbeat", { ts: Date.now() });
        }, 25000);

        req.on("close", () => {
          clearInterval(heartbeat);
          unsubscribe();
          res.end();
        });
        return;
      }

      const sessionStateMatch = pathname.match(/^\/api\/session\/([^/]+)\/state$/);
      if (sessionStateMatch && req.method === "GET") {
        const state = runtime.getSessionState(sessionStateMatch[1]);
        if (!state) {
          writeJson(res, 404, { error: "Session not found" });
          return;
        }
        writeJson(res, 200, state as unknown as JsonValue);
        return;
      }

      writeJson(res, 404, { error: "API route not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      writeJson(res, 400, { error: message });
    }
  };
}
