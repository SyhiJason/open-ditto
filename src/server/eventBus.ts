import type { ServerResponse } from "node:http";
import type { EventRecord } from "./types";

const sessionStreams = new Map<string, Set<ServerResponse>>();

function formatSseChunk(eventName: string, payload: Record<string, unknown>, id?: number): string {
  const lines: string[] = [];
  if (typeof id === "number") {
    lines.push(`id: ${id}`);
  }
  lines.push(`event: ${eventName}`);
  lines.push(`data: ${JSON.stringify(payload)}`);
  return `${lines.join("\n")}\n\n`;
}

export function subscribeSessionEvents(sessionId: string, res: ServerResponse): () => void {
  const streams = sessionStreams.get(sessionId) ?? new Set<ServerResponse>();
  streams.add(res);
  sessionStreams.set(sessionId, streams);

  return () => {
    const current = sessionStreams.get(sessionId);
    if (!current) {
      return;
    }
    current.delete(res);
    if (current.size === 0) {
      sessionStreams.delete(sessionId);
    }
  };
}

export function writeSseEvent(res: ServerResponse, event: EventRecord): void {
  const payload = {
    id: event.id,
    session_id: event.session_id,
    node: event.node,
    event_type: event.event_type,
    payload: event.payload,
    created_at: event.created_at,
  };
  res.write(formatSseChunk("progress", payload, event.id));
}

export function publishSessionEvent(event: EventRecord): void {
  const streams = sessionStreams.get(event.session_id);
  if (!streams || streams.size === 0) {
    return;
  }

  for (const res of streams) {
    writeSseEvent(res, event);
  }
}

export function writeSseInfo(
  res: ServerResponse,
  eventName: string,
  payload: Record<string, unknown>
): void {
  res.write(formatSseChunk(eventName, payload));
}
