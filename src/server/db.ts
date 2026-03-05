import fs from "node:fs";
import path from "node:path";
import type {
  AuditRecord,
  DatePlan,
  EventRecord,
  LangGraphState,
  NegotiationLog,
  NegotiationRecord,
} from "./types";

type PersistedStore = {
  sessions: Record<
    string,
    {
      user_id: string;
      trace_id: string;
      state: LangGraphState;
      created_at: number;
      updated_at: number;
    }
  >;
  events: EventRecord[];
  negotiations: Record<
    string,
    {
      negotiation: NegotiationRecord;
      date_plan_id: string | null;
    }
  >;
  date_plans: Record<string, DatePlan>;
  audit_logs: AuditRecord[];
  counters: {
    event_id: number;
    audit_id: number;
  };
};

const dataDir = path.join(process.cwd(), ".data");
const dbPath = path.join(dataDir, "open_ditto_store.json");

let store: PersistedStore | null = null;

function ensureStore(): PersistedStore {
  if (store) {
    return store;
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    const initial: PersistedStore = {
      sessions: {},
      events: [],
      negotiations: {},
      date_plans: {},
      audit_logs: [],
      counters: {
        event_id: 0,
        audit_id: 0,
      },
    };
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2), "utf-8");
    store = initial;
    return initial;
  }

  const raw = fs.readFileSync(dbPath, "utf-8");
  const parsed = JSON.parse(raw) as PersistedStore;
  store = {
    sessions: parsed.sessions ?? {},
    events: parsed.events ?? [],
    negotiations: parsed.negotiations ?? {},
    date_plans: parsed.date_plans ?? {},
    audit_logs: parsed.audit_logs ?? [],
    counters: {
      event_id: Number(parsed.counters?.event_id ?? 0),
      audit_id: Number(parsed.counters?.audit_id ?? 0),
    },
  };
  return store;
}

function flush(): void {
  if (!store) {
    return;
  }
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), "utf-8");
}

export function saveSession(state: LangGraphState): void {
  const db = ensureStore();
  const now = Date.now();
  const existing = db.sessions[state.session_id];

  db.sessions[state.session_id] = {
    user_id: state.user_id,
    trace_id: state.trace_id,
    state,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  flush();
}

export function getSession(sessionId: string): LangGraphState | null {
  const db = ensureStore();
  const row = db.sessions[sessionId];
  if (!row) {
    return null;
  }
  return JSON.parse(JSON.stringify(row.state)) as LangGraphState;
}

export function appendSessionEvent(
  sessionId: string,
  node: string,
  eventType: string,
  payload: Record<string, unknown>
): EventRecord {
  const db = ensureStore();
  db.counters.event_id += 1;

  const event: EventRecord = {
    id: db.counters.event_id,
    session_id: sessionId,
    node,
    event_type: eventType,
    payload,
    created_at: Date.now(),
  };

  db.events.push(event);
  flush();
  return event;
}

export function listSessionEvents(
  sessionId: string,
  options?: { afterId?: number; limit?: number }
): EventRecord[] {
  const db = ensureStore();
  const afterId = options?.afterId ?? 0;
  const limit = options?.limit ?? 200;

  return db.events
    .filter((event) => event.session_id === sessionId && event.id > afterId)
    .sort((a, b) => a.id - b.id)
    .slice(0, limit)
    .map((event) => JSON.parse(JSON.stringify(event)) as EventRecord);
}

export function saveNegotiation(record: {
  negotiationId: string;
  sessionId: string;
  candidateId: string;
  status: string;
  turns: number;
  compatibilityScore: number;
  logs: NegotiationLog[];
  datePlanId?: string | null;
}): NegotiationRecord {
  const db = ensureStore();
  const now = Date.now();
  const existing = db.negotiations[record.negotiationId];

  const negotiation: NegotiationRecord = {
    negotiation_id: record.negotiationId,
    session_id: record.sessionId,
    candidate_id: record.candidateId,
    status: record.status,
    turns: record.turns,
    compatibility_score: record.compatibilityScore,
    logs: record.logs,
    created_at: existing?.negotiation.created_at ?? now,
    updated_at: now,
  };

  db.negotiations[record.negotiationId] = {
    negotiation,
    date_plan_id: record.datePlanId ?? null,
  };

  flush();
  return JSON.parse(JSON.stringify(negotiation)) as NegotiationRecord;
}

export function getNegotiation(negotiationId: string): {
  negotiation: NegotiationRecord;
  datePlanId: string | null;
} | null {
  const db = ensureStore();
  const row = db.negotiations[negotiationId];
  if (!row) {
    return null;
  }

  return {
    negotiation: JSON.parse(JSON.stringify(row.negotiation)) as NegotiationRecord,
    datePlanId: row.date_plan_id,
  };
}

export function saveDatePlan(plan: DatePlan): void {
  const db = ensureStore();
  db.date_plans[plan.id] = JSON.parse(JSON.stringify(plan)) as DatePlan;
  flush();
}

export function getDatePlan(datePlanId: string): DatePlan | null {
  const db = ensureStore();
  const row = db.date_plans[datePlanId];
  if (!row) {
    return null;
  }
  return JSON.parse(JSON.stringify(row)) as DatePlan;
}

export function appendAuditLog(input: {
  sessionId: string;
  negotiationId: string;
  actor: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): AuditRecord {
  const db = ensureStore();
  db.counters.audit_id += 1;

  const audit: AuditRecord = {
    id: db.counters.audit_id,
    session_id: input.sessionId,
    negotiation_id: input.negotiationId,
    actor: input.actor,
    action: input.action,
    before: input.before,
    after: input.after,
    created_at: Date.now(),
  };

  db.audit_logs.push(audit);
  flush();
  return JSON.parse(JSON.stringify(audit)) as AuditRecord;
}
