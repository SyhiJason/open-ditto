import { Agent, DatePlan, Memory, NegotiationLog, UserProfile } from "../store/useStore";

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let details = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string") {
        details = body.error;
      }
    } catch {
      // ignore parse failure and keep status-based message
    }
    throw new Error(details);
  }

  return (await response.json()) as T;
}

function mapDatePlan(raw: unknown): DatePlan | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    venue: String(row.venue ?? ""),
    date: String(row.date ?? ""),
    time: String(row.time ?? ""),
    notes: String(row.notes ?? ""),
    confirmed: Boolean(row.confirmed),
    status:
      row.status === "LOCKED_PENDING_CONFIRM" ||
      row.status === "CONFIRMED" ||
      row.status === "RELEASED" ||
      row.status === "FAILED"
        ? row.status
        : undefined,
    lockExpiresAt:
      typeof row.lock_expires_at === "number"
        ? row.lock_expires_at
        : typeof row.lockExpiresAt === "number"
          ? row.lockExpiresAt
          : null,
  };
}

function mapNegotiationLog(raw: unknown): NegotiationLog | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const type = row.type;
  const status = row.status;
  if (
    (type !== "Memory" && type !== "Decision" && type !== "Consensus" && type !== "Override") ||
    (status !== "accepted" && status !== "conditional" && status !== "rejected")
  ) {
    return null;
  }

  return {
    id: String(row.id ?? crypto.randomUUID()),
    memoryId: typeof row.memoryId === "string" ? row.memoryId : undefined,
    type,
    timestamp: String(row.timestamp ?? ""),
    perception: String(row.perception ?? ""),
    reasoning: String(row.reasoning ?? ""),
    action: String(row.action ?? ""),
    status,
    round: typeof row.round === "number" ? row.round : undefined,
    jsonPayload:
      row.json_payload && typeof row.json_payload === "object"
        ? (row.json_payload as Record<string, unknown>)
        : row.jsonPayload && typeof row.jsonPayload === "object"
          ? (row.jsonPayload as Record<string, unknown>)
          : undefined,
    actor: typeof row.actor === "string" ? row.actor : undefined,
  };
}

function mapMemory(raw: unknown): Memory | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const source = row.source;
  if (source !== "questionnaire" && source !== "chat" && source !== "feedback") {
    return null;
  }

  return {
    id: String(row.id ?? crypto.randomUUID()),
    content: String(row.content ?? ""),
    source,
    weight: Number(row.weight ?? 0),
    timestamp: Number(row.timestamp ?? Date.now()),
  };
}

function mapAgentFromCandidate(candidate: Record<string, unknown>, avatarFallback?: string): Agent | null {
  const profile = candidate.profile;
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const p = profile as Record<string, unknown>;
  const mappedProfile: UserProfile = {
    name: String(p.name ?? ""),
    age: Number(p.age ?? 0),
    city: String(p.city ?? ""),
    interests: Array.isArray(p.interests) ? p.interests.map((i) => String(i)) : [],
    partnerPrefs: String(p.partnerPrefs ?? ""),
    dealbreakers: String(p.dealbreakers ?? ""),
    selfDescription: String(p.selfDescription ?? ""),
  };

  return {
    id: String(candidate.id ?? crypto.randomUUID()),
    name: String(candidate.name ?? mappedProfile.name),
    state: "Reflecting",
    score: Number(candidate.composite_score ?? 0),
    avatarUrl:
      avatarFallback ??
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(String(candidate.id ?? mappedProfile.name))}`,
    x: 0,
    y: 0,
    profile: mappedProfile,
    memories: [],
    chatHistory: [],
    trustScore: Number(candidate.trust_score ?? 0.75),
    scheduleScore: Number(candidate.schedule_score ?? 0.7),
    riskTags: Array.isArray(candidate.risk_tags)
      ? candidate.risk_tags.map((item) => String(item))
      : [],
    matchExplanation:
      typeof candidate.match_explanation === "string" ? candidate.match_explanation : undefined,
  };
}

export interface OnboardingStartResult {
  sessionId: string;
  traceId: string;
  profile: UserProfile;
  memories: Memory[];
  onboardingScore: number;
}

export async function startOnboardingSession(input: {
  profile: UserProfile;
  userId?: string;
  candidatePool?: Agent[];
}): Promise<OnboardingStartResult> {
  const result = await postJson<{
    session_id: string;
    trace_id: string;
    profile: UserProfile;
    memories: unknown[];
    onboarding_score: number;
  }>("/api/onboarding/start", {
    user_id: input.userId,
    profile: input.profile,
    candidate_pool: input.candidatePool?.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      profile: candidate.profile,
      trust_score: candidate.trustScore ?? 0.75,
      schedule_score: candidate.scheduleScore ?? 0.7,
      risk_tags: candidate.riskTags ?? [],
    })),
  });

  return {
    sessionId: result.session_id,
    traceId: result.trace_id,
    profile: result.profile,
    memories: (result.memories ?? []).map(mapMemory).filter(Boolean) as Memory[],
    onboardingScore: result.onboarding_score,
  };
}

export async function runOnboardingChat(
  sessionId: string,
  userMessage: string
): Promise<{ reply: string; newMemory: Memory | null; onboardingScore: number; onboardingDone: boolean }> {
  const result = await postJson<{
    reply: string;
    new_memory: unknown;
    onboarding_score: number;
    onboarding_done: boolean;
  }>(`/api/onboarding/${sessionId}/chat`, {
    message: userMessage,
  });

  return {
    reply: result.reply,
    newMemory: mapMemory(result.new_memory),
    onboardingScore: result.onboarding_score,
    onboardingDone: result.onboarding_done,
  };
}

export async function runMatchGraph(
  sessionId: string,
  candidates: Agent[],
  topK = 5
): Promise<{ shortlist: Agent[]; filteredOut: Array<{ id: string; reason: string }> }> {
  const avatarMap = new Map(candidates.map((candidate) => [candidate.id, candidate.avatarUrl]));

  const result = await postJson<{
    shortlist: Array<Record<string, unknown>>;
    filtered_out: Array<{ id: string; reason: string }>;
  }>("/api/match/run", {
    session_id: sessionId,
    top_k: topK,
    candidate_pool: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      profile: candidate.profile,
      trust_score: candidate.trustScore ?? 0.75,
      schedule_score: candidate.scheduleScore ?? 0.7,
      risk_tags: candidate.riskTags ?? [],
    })),
  });

  return {
    shortlist: result.shortlist
      .map((candidate) =>
        mapAgentFromCandidate(candidate, avatarMap.get(String(candidate.id ?? "")))
      )
      .filter(Boolean) as Agent[],
    filteredOut: result.filtered_out,
  };
}

export async function persistSwipeEvent(input: {
  sessionId: string;
  candidateId: string;
  action: "left" | "right";
  rejectReasonTag?: string;
}): Promise<{ rightSwipeCandidateId: string | null; continueBrowsing: boolean }> {
  const result = await postJson<{
    right_swipe_candidate_id: string | null;
    continue_browsing: boolean;
  }>("/api/match/swipe", {
    session_id: input.sessionId,
    candidate_id: input.candidateId,
    action: input.action,
    reject_reason_tag: input.rejectReasonTag,
  });

  return {
    rightSwipeCandidateId: result.right_swipe_candidate_id,
    continueBrowsing: result.continue_browsing,
  };
}

export interface NegotiationResult {
  negotiationId: string;
  compatibilityScore: number;
  logs: NegotiationLog[];
  datePlan: DatePlan | null;
  failReason?: "time_conflict" | "pref_conflict" | "info_insufficient";
}

export async function runAgentNegotiation(
  sessionId: string,
  candidateId: string
): Promise<NegotiationResult> {
  const result = await postJson<{
    negotiation_id: string;
    negotiation_logs: unknown[];
    compatibility_score: number;
    date_plan: unknown;
    fail_reason?: "time_conflict" | "pref_conflict" | "info_insufficient";
  }>("/api/negotiation/start", {
    session_id: sessionId,
    candidate_id: candidateId,
  });

  return {
    negotiationId: result.negotiation_id,
    compatibilityScore: result.compatibility_score,
    logs: (result.negotiation_logs ?? []).map(mapNegotiationLog).filter(Boolean) as NegotiationLog[],
    datePlan: mapDatePlan(result.date_plan),
    failReason: result.fail_reason,
  };
}

export async function applyNegotiationOverride(input: {
  negotiationId: string;
  sessionId: string;
  instruction: string;
  action?: "approve" | "reject" | "replan";
  actor?: string;
  overrides?: Partial<Pick<DatePlan, "venue" | "date" | "time" | "notes">>;
}): Promise<{ approvedPlan: DatePlan | null; backToDiscover: boolean }> {
  const result = await postJson<{
    approved_plan: unknown;
    back_to_discover: boolean;
  }>(`/api/negotiation/${input.negotiationId}/override`, {
    session_id: input.sessionId,
    instruction: input.instruction,
    action: input.action,
    actor: input.actor,
    overrides: input.overrides,
  });

  return {
    approvedPlan: mapDatePlan(result.approved_plan),
    backToDiscover: result.back_to_discover,
  };
}

export async function confirmDatePlan(input: {
  datePlanId: string;
  sessionId: string;
  confirm: boolean;
  actor?: string;
}): Promise<{ datePlan: DatePlan; released: boolean }> {
  const result = await postJson<{
    date_plan: unknown;
    released: boolean;
  }>(`/api/date/${input.datePlanId}/confirm`, {
    session_id: input.sessionId,
    confirm: input.confirm,
    actor: input.actor,
  });

  const mapped = mapDatePlan(result.date_plan);
  if (!mapped) {
    throw new Error("Invalid date plan payload");
  }

  return {
    datePlan: mapped,
    released: result.released,
  };
}

export async function submitPostDateFeedback(input: {
  sessionId: string;
  candidateId: string;
  attended: boolean;
  feedback: string;
  cancelReason?: string;
}): Promise<void> {
  await postJson<{ ok: boolean }>("/api/post-date/feedback", {
    session_id: input.sessionId,
    candidate_id: input.candidateId,
    attended: input.attended,
    feedback: input.feedback,
    cancel_reason: input.cancelReason,
  });
}

export function buildSessionEventsStreamUrl(sessionId: string, after = 0): string {
  return `/api/session/${sessionId}/events?after=${after}`;
}
