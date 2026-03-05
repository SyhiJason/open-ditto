import { randomUUID } from "node:crypto";
import {
  appendAuditLog,
  appendSessionEvent,
  getDatePlan,
  getNegotiation,
  getSession,
  saveDatePlan,
  saveNegotiation,
  saveSession,
} from "./db";
import { publishSessionEvent } from "./eventBus";
import { DEFAULT_CANDIDATES, VENUE_POOL, getMockCalendarSlots } from "./mockData";
import type {
  Candidate,
  DatePlan,
  DatePlanStatus,
  LangGraphState,
  Memory,
  NegotiationJsonTurn,
  NegotiationLog,
  SwipeEvent,
  UserProfile,
} from "./types";

const NEGATIVE_FEEDBACK_PENALTY = 1.6;
const POSITIVE_FEEDBACK_BONUS = 0.6;
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

type MatchScoreBreakdown = {
  interest: number;
  partnerPref: number;
  schedule: number;
  trust: number;
  penalty: number;
};

function nowIsoTime(): string {
  return new Date().toLocaleTimeString();
}

function cloneState(state: LangGraphState): LangGraphState {
  return JSON.parse(JSON.stringify(state)) as LangGraphState;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,，。.;；、!！?？:\-_/]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function textOverlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of ta) {
    if (tb.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(ta.size, tb.size);
}

function parseAgeRange(partnerPrefs: string, userAge: number): { min: number; max: number } {
  const rangeMatch = partnerPrefs.match(/(\d{2})\D+(\d{2})/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }

  const min = clamp(userAge - 6, 18, 100);
  const max = clamp(userAge + 6, 18, 100);
  return { min, max };
}

function normalizeInterests(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))].slice(0, 10);
  }

  if (typeof raw === "string") {
    return [...new Set(raw.split(/[\s,，、/]+/).map((v) => v.trim()).filter(Boolean))].slice(0, 10);
  }

  return [];
}

function normalizeProfile(raw: Partial<UserProfile>): UserProfile {
  return {
    name: String(raw.name ?? "").trim(),
    age: Number(raw.age ?? 0),
    city: String(raw.city ?? "").trim(),
    interests: normalizeInterests(raw.interests),
    partnerPrefs: String(raw.partnerPrefs ?? "").trim(),
    dealbreakers: String(raw.dealbreakers ?? "").trim(),
    selfDescription: String(raw.selfDescription ?? "").trim(),
  };
}

function validateProfile(profile: UserProfile): string[] {
  const errors: string[] = [];

  if (!profile.name || profile.name.length > 32) {
    errors.push("name must be a non-empty string <= 32 chars");
  }

  if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 100) {
    errors.push("age must be an integer between 18 and 100");
  }

  // city schema validation: plain string, supports CN/EN chars and spaces.
  const citySchema = /^[\p{L}\p{Script=Han}0-9\s-]{1,40}$/u;
  if (!citySchema.test(profile.city)) {
    errors.push("city must match city schema");
  }

  // interests schema validation: 1-10 items, each non-empty token <= 20 chars.
  if (profile.interests.length < 1 || profile.interests.length > 10) {
    errors.push("interests must contain 1-10 items");
  }
  const invalidInterest = profile.interests.find((interest) => interest.length < 1 || interest.length > 20);
  if (invalidInterest) {
    errors.push("interests item must be 1-20 chars");
  }

  if (!profile.partnerPrefs) {
    errors.push("partnerPrefs is required");
  }
  if (!profile.dealbreakers) {
    errors.push("dealbreakers is required");
  }
  if (!profile.selfDescription) {
    errors.push("selfDescription is required");
  }

  return errors;
}

function profileToSeedMemories(profile: UserProfile): Memory[] {
  const entries = [
    {
      content: `用户居住在${profile.city}，年龄 ${profile.age}。`,
      weight: 0.92,
      category: "demographic",
    },
    {
      content: `兴趣偏好：${profile.interests.join("、")}`,
      weight: 0.9,
      category: "interests",
    },
    {
      content: `伴侣偏好：${profile.partnerPrefs}`,
      weight: 0.88,
      category: "partner_prefs",
    },
    {
      content: `不能接受：${profile.dealbreakers}`,
      weight: 0.95,
      category: "dealbreakers",
    },
    {
      content: `自我描述：${profile.selfDescription}`,
      weight: 0.72,
      category: "self",
    },
  ];

  return entries.map((entry) => ({
    id: randomUUID(),
    content: entry.content,
    source: "questionnaire",
    weight: entry.weight,
    timestamp: Date.now(),
    metadata: {
      category: entry.category,
      rawJson: {
        schema: "memory.v1",
        content: entry.content,
        weight: entry.weight,
        category: entry.category,
      },
    },
  }));
}

function calculateOnboardingScore(state: LangGraphState): number {
  let score = 0;
  if (state.profile) {
    score += 45;
    score += Math.min(15, state.profile.interests.length * 3);
  }
  score += Math.min(25, state.chat_turn_count * 8);
  score += Math.min(15, state.memories.length * 1.5);
  return clamp(Math.round(score), 0, 100);
}

function createInitialState(userId?: string): LangGraphState {
  const sessionId = randomUUID();
  return {
    user_id: userId?.trim() || `user_${sessionId.slice(0, 8)}`,
    session_id: sessionId,
    profile: null,
    memories: [],
    candidate_pool: [...DEFAULT_CANDIDATES],
    shortlist: [],
    active_candidate: null,
    swipe_events: [],
    negotiation_turns: [],
    negotiation_logs: [],
    human_override_instruction: null,
    date_plan: null,
    errors: [],
    trace_id: randomUUID(),
    onboarding_score: 0,
    chat_turn_count: 0,
    active_negotiation_id: null,
    feedback_penalties: {},
  };
}

function withEvent(
  state: LangGraphState,
  node: string,
  eventType: string,
  payload: Record<string, unknown>
): void {
  const event = appendSessionEvent(state.session_id, node, eventType, payload);
  publishSessionEvent(event);
}

function appendError(state: LangGraphState, node: string, message: string): void {
  state.errors.push({
    id: randomUUID(),
    node,
    message,
    timestamp: Date.now(),
  });
}

function generateOnboardingReply(state: LangGraphState, userMessage: string): string {
  const profile = state.profile;
  const fallbackName = profile?.name || "你";
  const lower = userMessage.toLowerCase();

  if (lower.includes("周末") || lower.includes("休息")) {
    return `${fallbackName}，我记录到你在周末安排上有稳定偏好。我会优先匹配同节奏的人。`;
  }
  if (lower.includes("不喜欢") || lower.includes("讨厌") || lower.includes("无法接受")) {
    return `收到，这条属于高优先级边界条件。我会把它作为硬约束放进筛选。`;
  }
  if (lower.includes("喜欢") || lower.includes("爱") || lower.includes("想要")) {
    return `明白了，这个偏好会提升在匹配评分中的权重。我还会继续收集你的作息和约会场景偏好。`;
  }

  const topMemory = [...state.memories].sort((a, b) => b.weight - a.weight)[0];
  if (topMemory) {
    return `我正在持续学习你。当前最重要记忆是“${topMemory.content}”。你可以继续补充日程和约会偏好。`;
  }

  return `我已记录这条信息。再聊几句你的生活节奏和约会偏好，我就可以进入精准匹配。`;
}

function extractMemoryJson(userMessage: string): {
  content: string;
  weight: number;
  category: string;
  reason: string;
} | null {
  const text = userMessage.trim();
  if (!text) {
    return null;
  }

  if (text.length < 5) {
    return {
      content: text,
      weight: 0.35,
      category: "short_signal",
      reason: "短文本信号，低置信保留",
    };
  }

  const highPriority = /(不喜欢|不能接受|无法接受|讨厌|底线|dealbreaker)/i;
  if (highPriority.test(text)) {
    return {
      content: text,
      weight: 0.93,
      category: "dealbreaker",
      reason: "检测到强边界词",
    };
  }

  const schedulePattern = /(周一|周二|周三|周四|周五|周末|晚上|下午|早上|作息|加班|空闲)/;
  if (schedulePattern.test(text)) {
    return {
      content: text,
      weight: 0.78,
      category: "schedule",
      reason: "检测到作息/时间窗口信息",
    };
  }

  const interestPattern = /(喜欢|爱好|兴趣|常去|常看|想尝试)/;
  if (interestPattern.test(text)) {
    return {
      content: text,
      weight: 0.82,
      category: "interest",
      reason: "检测到兴趣偏好",
    };
  }

  return {
    content: text,
    weight: 0.6,
    category: "general",
    reason: "通用偏好信息",
  };
}

function upsertMemory(state: LangGraphState, extracted: {
  content: string;
  weight: number;
  category: string;
  reason: string;
}): Memory {
  const existing = state.memories.find((memory) => memory.content === extracted.content);
  if (existing) {
    existing.weight = clamp(existing.weight + 0.05, 0, 1);
    existing.timestamp = Date.now();
    existing.metadata = {
      category: extracted.category,
      rawJson: {
        schema: "memory.v1",
        content: extracted.content,
        weight: extracted.weight,
        category: extracted.category,
        reason: extracted.reason,
      },
    };
    return existing;
  }

  const memory: Memory = {
    id: randomUUID(),
    content: extracted.content,
    source: "chat",
    weight: clamp(extracted.weight, 0, 1),
    timestamp: Date.now(),
    metadata: {
      category: extracted.category,
      rawJson: {
        schema: "memory.v1",
        content: extracted.content,
        weight: extracted.weight,
        category: extracted.category,
        reason: extracted.reason,
      },
    },
  };

  state.memories.push(memory);
  return memory;
}

function normalizeCandidate(raw: unknown): Candidate[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_CANDIDATES];
  }

  const parsed: Candidate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const objectRow = row as Record<string, unknown>;
    const profileRaw = objectRow.profile;
    if (!profileRaw || typeof profileRaw !== "object") {
      continue;
    }

    const profile = normalizeProfile(profileRaw as Partial<UserProfile>);
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      continue;
    }

    parsed.push({
      id: String(objectRow.id ?? randomUUID()),
      name: String(objectRow.name ?? profile.name),
      profile,
      trust_score: clamp(Number(objectRow.trust_score ?? 0.75), 0, 1),
      schedule_score: clamp(Number(objectRow.schedule_score ?? 0.7), 0, 1),
      risk_tags: Array.isArray(objectRow.risk_tags)
        ? objectRow.risk_tags.map((tag) => String(tag))
        : [],
    });
  }

  return parsed.length > 0 ? parsed : [...DEFAULT_CANDIDATES];
}

function keywordPenalty(state: LangGraphState, candidate: Candidate): number {
  const tags = candidate.profile.interests;
  let penalty = 0;
  for (const tag of tags) {
    penalty += state.feedback_penalties[tag] ?? 0;
  }
  return penalty;
}

function buildMatchScore(state: LangGraphState, candidate: Candidate): MatchScoreBreakdown & { total: number } {
  const profile = state.profile;
  if (!profile) {
    return {
      interest: 0,
      partnerPref: 0,
      schedule: 0,
      trust: 0,
      penalty: 0,
      total: 0,
    };
  }

  const interestOverlap =
    profile.interests.filter((interest) => candidate.profile.interests.includes(interest)).length /
    Math.max(profile.interests.length, 1);
  const interest = interestOverlap * 35;

  const partnerRefA = `${profile.partnerPrefs} ${profile.selfDescription}`;
  const partnerRefB = `${candidate.profile.partnerPrefs} ${candidate.profile.selfDescription}`;
  const partnerPref = textOverlapScore(partnerRefA, partnerRefB) * 30;

  const scheduleMemoryText = state.memories
    .filter((memory) => memory.metadata?.category === "schedule")
    .map((memory) => memory.content)
    .join(" ");
  const scheduleSignal = scheduleMemoryText
    ? clamp(textOverlapScore(scheduleMemoryText, partnerRefB), 0.2, 1)
    : 0.65;
  const schedule = scheduleSignal * 20 * candidate.schedule_score;

  const trust = candidate.trust_score * 15;

  const penalty = keywordPenalty(state, candidate);
  const total = clamp(Math.round(interest + partnerPref + schedule + trust - penalty), 0, 100);

  return {
    interest,
    partnerPref,
    schedule,
    trust,
    penalty,
    total,
  };
}

function shouldFilterByDealbreaker(userDealbreakers: string, candidate: Candidate): boolean {
  const tokens = tokenize(userDealbreakers);
  if (tokens.length === 0) {
    return false;
  }

  const target = `${candidate.profile.selfDescription} ${candidate.profile.partnerPrefs} ${candidate.profile.dealbreakers}`.toLowerCase();
  return tokens.some((token) => token.length > 1 && target.includes(token));
}

function pickVenue(city: string, interests: string[], offset = 0): { name: string; notes: string } {
  const filtered = VENUE_POOL.filter((venue) => venue.city === city);
  const fallbackPool = filtered.length > 0 ? filtered : VENUE_POOL;

  const scored = fallbackPool
    .map((venue) => {
      const overlap = interests.filter((interest) => venue.tags.includes(interest)).length;
      return { venue, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap);

  const selected = scored[offset % Math.max(scored.length, 1)]?.venue ?? fallbackPool[0];
  return {
    name: selected.name,
    notes: `${selected.type} · ${selected.vibe}`,
  };
}

function evaluateProposal(
  user: UserProfile,
  candidate: Candidate,
  proposal: { venue: string; date: string; time: string; notes: string },
  availableSlots: ReturnType<typeof getMockCalendarSlots>
): {
  accept: boolean;
  reason: string;
  score: number;
  retryReason?: "time_conflict" | "pref_conflict" | "info_insufficient";
  counter?: { venue: string; date: string; time: string; notes: string };
} {
  const slotMatch = availableSlots.find((slot) => slot.date === proposal.date && proposal.time >= slot.start && proposal.time <= slot.end);
  const venueInfo = VENUE_POOL.find((venue) => venue.name === proposal.venue);

  if (!slotMatch) {
    const fallbackSlot = availableSlots[0];
    return {
      accept: false,
      reason: "提议时间不在双方可用时间槽内",
      score: 52,
      retryReason: "time_conflict",
      counter: {
        venue: proposal.venue,
        date: fallbackSlot.date,
        time: fallbackSlot.start,
        notes: "改为双方都可用的时间",
      },
    };
  }

  if (!venueInfo) {
    return {
      accept: false,
      reason: "缺少场地信息，无法判断偏好适配",
      score: 48,
      retryReason: "info_insufficient",
      counter: {
        venue: pickVenue(user.city, user.interests).name,
        date: slotMatch.date,
        time: slotMatch.start,
        notes: "替换为可解释场地",
      },
    };
  }

  const interestOverlap = user.interests.filter((interest) => venueInfo.tags.includes(interest)).length;
  const hardConflict = shouldFilterByDealbreaker(user.dealbreakers, candidate);

  if (hardConflict) {
    return {
      accept: false,
      reason: "候选人与用户硬性边界冲突",
      score: 25,
      retryReason: "pref_conflict",
    };
  }

  if (interestOverlap === 0) {
    const alternative = pickVenue(user.city, user.interests);
    return {
      accept: false,
      reason: "场地与用户兴趣重叠不足",
      score: 59,
      retryReason: "pref_conflict",
      counter: {
        venue: alternative.name,
        date: slotMatch.date,
        time: slotMatch.start,
        notes: alternative.notes,
      },
    };
  }

  const softScore = clamp(Math.round(70 + interestOverlap * 8 + candidate.trust_score * 10), 0, 99);
  return {
    accept: true,
    reason: "时间可行且场地符合兴趣偏好",
    score: softScore,
  };
}

function toNegotiationLog(input: {
  type: NegotiationLog["type"];
  perception: string;
  reasoning: string;
  action: string;
  status: NegotiationLog["status"];
  round?: number;
  jsonPayload?: Record<string, unknown>;
  actor?: string;
}): NegotiationLog {
  return {
    id: randomUUID(),
    type: input.type,
    timestamp: nowIsoTime(),
    perception: input.perception,
    reasoning: input.reasoning,
    action: input.action,
    status: input.status,
    round: input.round,
    json_payload: input.jsonPayload,
    actor: input.actor,
  };
}

function runDatePlanningGraph(input: {
  state: LangGraphState;
  negotiationId: string;
  proposal: { venue: string; date: string; time: string; notes: string };
  user: UserProfile;
}): { datePlan: DatePlan; options: Array<{ venue: string; date: string; time: string; notes: string }> } {
  const { state, negotiationId, proposal, user } = input;

  withEvent(state, "fetch_calendar", "start", {});
  const slots = getMockCalendarSlots();
  withEvent(state, "fetch_calendar", "end", { slots });

  withEvent(state, "fetch_venues", "start", { city: user.city });
  const venues = VENUE_POOL.filter((venue) => venue.city === user.city);
  const fallbackVenues = venues.length > 0 ? venues : VENUE_POOL;
  withEvent(state, "fetch_venues", "end", { count: fallbackVenues.length });

  withEvent(state, "generate_3_options", "start", {});
  const options = [0, 1, 2].map((index) => {
    const venue = fallbackVenues[index % fallbackVenues.length];
    const slot = slots[index % slots.length];
    return {
      venue: venue.name,
      date: slot.date,
      time: slot.start,
      notes: `${venue.type} · ${venue.vibe}`,
    };
  });
  withEvent(state, "generate_3_options", "end", { options });

  withEvent(state, "conflict_check", "start", {});
  const selected = options.find(
    (option) => option.venue === proposal.venue && option.date === proposal.date
  ) ?? options[0];
  withEvent(state, "conflict_check", "end", { selected });

  withEvent(state, "lock_slot", "start", {});
  const lockExpiresAt = Date.now() + LOCK_TIMEOUT_MS;
  const datePlan: DatePlan = {
    id: randomUUID(),
    session_id: state.session_id,
    negotiation_id: negotiationId,
    venue: selected.venue,
    date: selected.date,
    time: selected.time,
    notes: selected.notes,
    status: "LOCKED_PENDING_CONFIRM",
    confirmed: false,
    lock_expires_at: lockExpiresAt,
  };
  withEvent(state, "lock_slot", "end", {
    date_plan_id: datePlan.id,
    lock_expires_at: lockExpiresAt,
  });

  withEvent(state, "notify", "end", {
    message: "约会时段已锁定待确认",
    date_plan_id: datePlan.id,
  });

  return { datePlan, options };
}

function ensureLockStatus(plan: DatePlan): DatePlan {
  if (plan.status !== "LOCKED_PENDING_CONFIRM") {
    return plan;
  }

  if (plan.lock_expires_at && Date.now() > plan.lock_expires_at) {
    return {
      ...plan,
      status: "RELEASED",
      confirmed: false,
      lock_expires_at: null,
    };
  }

  return plan;
}

function updateSession(state: LangGraphState): LangGraphState {
  state.onboarding_score = calculateOnboardingScore(state);
  saveSession(state);
  return state;
}

export class OpenDittoRuntime {
  onboardingStart(input: {
    user_id?: string;
    profile: Partial<UserProfile>;
    candidate_pool?: unknown;
  }): {
    session_id: string;
    trace_id: string;
    profile: UserProfile;
    memories: Memory[];
    onboarding_score: number;
  } {
    const state = createInitialState(input.user_id);

    withEvent(state, "collect_profile", "start", {});
    const normalized = normalizeProfile(input.profile);
    withEvent(state, "collect_profile", "end", { profile: normalized });

    withEvent(state, "validate_profile", "start", {});
    let errors = validateProfile(normalized);
    withEvent(state, "validate_profile", "end", {
      valid: errors.length === 0,
      errors,
      retry: errors.length > 0,
    });

    let validatedProfile = normalized;
    if (errors.length > 0) {
      withEvent(state, "normalize_profile", "start", { retry_count: 1 });
      validatedProfile = normalizeProfile(normalized);
      errors = validateProfile(validatedProfile);
      withEvent(state, "normalize_profile", "end", {
        valid_after_retry: errors.length === 0,
        errors,
      });
    }

    if (errors.length > 0) {
      appendError(state, "validate_profile", errors.join("; "));
      updateSession(state);
      throw new Error(`Invalid profile after retry: ${errors.join("; ")}`);
    }

    state.profile = validatedProfile;

    withEvent(state, "seed_memories", "start", {});
    const seeded = profileToSeedMemories(validatedProfile);
    state.memories = seeded;
    withEvent(state, "seed_memories", "end", {
      memory_count: seeded.length,
    });

    state.candidate_pool = normalizeCandidate(input.candidate_pool);
    state.onboarding_score = calculateOnboardingScore(state);

    withEvent(state, "onboarding_done", "end", {
      onboarding_score: state.onboarding_score,
      onboarding_done: false,
    });

    updateSession(state);

    return {
      session_id: state.session_id,
      trace_id: state.trace_id,
      profile: validatedProfile,
      memories: state.memories,
      onboarding_score: state.onboarding_score,
    };
  }

  onboardingChat(input: {
    session_id: string;
    message: string;
  }): {
    reply: string;
    new_memory: Memory | null;
    onboarding_score: number;
    onboarding_done: boolean;
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }

    withEvent(state, "chat_learn_loop", "start", {
      message_length: input.message.length,
    });
    const reply = generateOnboardingReply(state, input.message);
    state.chat_turn_count += 1;
    withEvent(state, "chat_learn_loop", "end", { reply });

    withEvent(state, "extract_memory", "start", {});
    const extracted = extractMemoryJson(input.message);
    let memory: Memory | null = null;
    if (extracted) {
      memory = upsertMemory(state, extracted);
    }
    withEvent(state, "extract_memory", "end", {
      extracted_json: extracted ?? null,
      has_memory: Boolean(memory),
    });

    withEvent(state, "memory_weighting", "start", {});
    if (memory) {
      memory.weight = clamp(memory.weight + (memory.metadata?.category === "dealbreaker" ? 0.08 : 0.03), 0, 1);
      memory.timestamp = Date.now();
    }
    withEvent(state, "memory_weighting", "end", {
      memory_id: memory?.id,
      weight: memory?.weight,
    });

    state.onboarding_score = calculateOnboardingScore(state);
    const done = state.chat_turn_count >= 3 && state.onboarding_score >= 75;

    withEvent(state, "onboarding_done", "end", {
      onboarding_score: state.onboarding_score,
      onboarding_done: done,
    });

    updateSession(state);

    return {
      reply,
      new_memory: memory,
      onboarding_score: state.onboarding_score,
      onboarding_done: done,
    };
  }

  runMatchGraph(input: {
    session_id: string;
    candidate_pool?: unknown;
    top_k?: number;
  }): {
    shortlist: Candidate[];
    filtered_out: Array<{ id: string; reason: string }>;
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }
    if (!state.profile) {
      throw new Error("Profile missing, complete onboarding first");
    }

    withEvent(state, "retrieve_candidates", "start", {});
    state.candidate_pool = normalizeCandidate(input.candidate_pool ?? state.candidate_pool);
    withEvent(state, "retrieve_candidates", "end", {
      count: state.candidate_pool.length,
    });

    withEvent(state, "hard_filter", "start", {});
    const ageRange = parseAgeRange(state.profile.partnerPrefs, state.profile.age);

    const filteredOut: Array<{ id: string; reason: string }> = [];
    const hardPassed: Candidate[] = [];

    for (const candidate of state.candidate_pool) {
      if (shouldFilterByDealbreaker(state.profile.dealbreakers, candidate)) {
        filteredOut.push({ id: candidate.id, reason: "dealbreaker_conflict" });
        continue;
      }

      if (candidate.profile.city !== state.profile.city) {
        filteredOut.push({ id: candidate.id, reason: "city_mismatch" });
        continue;
      }

      if (candidate.profile.age < ageRange.min || candidate.profile.age > ageRange.max) {
        filteredOut.push({ id: candidate.id, reason: "age_range_mismatch" });
        continue;
      }

      hardPassed.push(candidate);
    }

    withEvent(state, "hard_filter", "end", {
      passed: hardPassed.length,
      filtered: filteredOut.length,
    });

    withEvent(state, "score_candidates", "start", {
      weights: {
        interest: 35,
        partner_pref: 30,
        schedule: 20,
        trust: 15,
      },
    });

    const scored = hardPassed.map((candidate) => {
      const breakdown = buildMatchScore(state, candidate);
      const explanation = `兴趣${breakdown.interest.toFixed(1)} + 偏好${breakdown.partnerPref.toFixed(1)} + 作息${breakdown.schedule.toFixed(1)} + 可信度${breakdown.trust.toFixed(1)} - 惩罚${breakdown.penalty.toFixed(1)}`;
      return {
        ...candidate,
        composite_score: breakdown.total,
        match_explanation: explanation,
      };
    });

    withEvent(state, "score_candidates", "end", {
      scored_count: scored.length,
    });

    withEvent(state, "risk_check", "start", {});
    const riskAdjusted = scored.map((candidate) => {
      let penalty = 0;
      if (candidate.trust_score < 0.7) {
        penalty += 8;
      }
      if ((candidate.risk_tags ?? []).length > 0) {
        penalty += 4;
      }
      const adjusted = clamp((candidate.composite_score ?? 0) - penalty, 0, 100);
      return {
        ...candidate,
        composite_score: adjusted,
        match_explanation: `${candidate.match_explanation}; 风险调整-${penalty}`,
      };
    });
    withEvent(state, "risk_check", "end", {
      checked_count: riskAdjusted.length,
    });

    withEvent(state, "top_k_shortlist", "start", {});
    const topK = clamp(Number(input.top_k ?? 5), 1, 20);
    state.shortlist = riskAdjusted
      .sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0))
      .slice(0, topK);
    withEvent(state, "top_k_shortlist", "end", {
      shortlist_count: state.shortlist.length,
    });

    updateSession(state);

    return {
      shortlist: state.shortlist,
      filtered_out: filteredOut,
    };
  }

  persistSwipe(input: {
    session_id: string;
    candidate_id: string;
    action: "left" | "right";
    reject_reason_tag?: string;
  }): {
    right_swipe_candidate_id: string | null;
    continue_browsing: boolean;
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }

    withEvent(state, "present_cards", "end", {
      candidate_id: input.candidate_id,
    });

    withEvent(state, "swipe_action", "start", {
      candidate_id: input.candidate_id,
      action: input.action,
    });

    const event: SwipeEvent = {
      id: randomUUID(),
      candidate_id: input.candidate_id,
      action: input.action,
      reject_reason_tag: input.reject_reason_tag,
      timestamp: Date.now(),
    };

    state.swipe_events.push(event);

    if (input.action === "right") {
      state.active_candidate =
        state.shortlist.find((candidate) => candidate.id === input.candidate_id) ??
        state.candidate_pool.find((candidate) => candidate.id === input.candidate_id) ??
        null;
    }

    if (input.action === "left" && input.reject_reason_tag) {
      const memory: Memory = {
        id: randomUUID(),
        content: `拒绝标签: ${input.reject_reason_tag}`,
        source: "feedback",
        weight: 0.7,
        timestamp: Date.now(),
        metadata: {
          category: "rejection_tag",
          rawJson: {
            schema: "swipe.rejection.v1",
            tag: input.reject_reason_tag,
            candidate_id: input.candidate_id,
          },
        },
      };
      state.memories.push(memory);
    }

    withEvent(state, "swipe_action", "end", {
      event_id: event.id,
      right_swipe_candidate_id: input.action === "right" ? input.candidate_id : null,
    });

    withEvent(state, "persist_swipe_event", "end", {
      swipe_count: state.swipe_events.length,
    });

    updateSession(state);

    return {
      right_swipe_candidate_id: input.action === "right" ? input.candidate_id : null,
      continue_browsing: input.action !== "right",
    };
  }

  startNegotiation(input: {
    session_id: string;
    candidate_id: string;
    available_slots?: ReturnType<typeof getMockCalendarSlots>;
  }): {
    negotiation_id: string;
    negotiation_logs: NegotiationLog[];
    compatibility_score: number;
    date_plan: DatePlan | null;
    fail_reason?: "time_conflict" | "pref_conflict" | "info_insufficient";
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }
    if (!state.profile) {
      throw new Error("Profile missing");
    }

    const candidate =
      state.shortlist.find((item) => item.id === input.candidate_id) ??
      state.candidate_pool.find((item) => item.id === input.candidate_id);

    if (!candidate) {
      throw new Error("Candidate not found");
    }

    state.active_candidate = candidate;
    state.negotiation_turns = [];
    state.negotiation_logs = [];

    withEvent(state, "prepare_briefs", "start", {});
    const topMemories = [...state.memories].sort((a, b) => b.weight - a.weight).slice(0, 5);
    const brief = {
      user: state.profile,
      candidate: candidate.profile,
      top_memories: topMemories.map((memory) => memory.content),
    };
    withEvent(state, "prepare_briefs", "end", { brief });

    const availableSlots = input.available_slots ?? getMockCalendarSlots();

    let accepted = false;
    let acceptedProposal: { venue: string; date: string; time: string; notes: string } | null = null;
    let failReason: "time_conflict" | "pref_conflict" | "info_insufficient" | undefined;

    for (let round = 1; round <= 3; round += 1) {
      withEvent(state, "propose_plan", "start", { round });
      const venue = pickVenue(candidate.profile.city, candidate.profile.interests, round - 1);
      const slot = availableSlots[(round - 1) % availableSlots.length];
      const proposal = {
        venue: venue.name,
        date: slot.date,
        time: slot.start,
        notes: venue.notes,
      };
      withEvent(state, "propose_plan", "end", { round, proposal });

      withEvent(state, "evaluate_plan", "start", { round });
      const evaluation = evaluateProposal(state.profile, candidate, proposal, availableSlots);
      withEvent(state, "evaluate_plan", "end", { round, evaluation });

      withEvent(state, "counter_or_accept", "start", { round });
      const consensus = {
        accepted: evaluation.accept,
        reason: evaluation.accept
          ? "proposal_accepted"
          : evaluation.counter
            ? "counter_proposed"
            : "rejected_without_counter",
      };

      if (!evaluation.accept && evaluation.counter) {
        const candidateCounterAcceptance =
          candidate.schedule_score >= 0.6 &&
          textOverlapScore(evaluation.counter.venue, candidate.profile.interests.join(" ")) >= 0;

        consensus.accepted = candidateCounterAcceptance;
        consensus.reason = candidateCounterAcceptance ? "counter_accepted" : "counter_rejected";

        if (candidateCounterAcceptance) {
          acceptedProposal = {
            venue: evaluation.counter.venue ?? proposal.venue,
            date: evaluation.counter.date ?? proposal.date,
            time: evaluation.counter.time ?? proposal.time,
            notes: evaluation.counter.notes ?? proposal.notes,
          };
          accepted = true;
        }
      }

      if (evaluation.accept) {
        acceptedProposal = proposal;
        accepted = true;
      }

      const roundJson: NegotiationJsonTurn = {
        round,
        proposal,
        evaluation: {
          accept: evaluation.accept,
          reason: evaluation.reason,
          score: evaluation.score,
          counter: evaluation.counter,
        },
        consensus,
      };
      state.negotiation_turns.push(roundJson);

      state.negotiation_logs.push(
        toNegotiationLog({
          type: "Decision",
          perception: `Round ${round} proposal: ${proposal.venue} ${proposal.date} ${proposal.time}`,
          reasoning: evaluation.reason,
          action: JSON.stringify(roundJson),
          status: consensus.accepted ? "accepted" : "conditional",
          round,
          jsonPayload: roundJson as unknown as Record<string, unknown>,
        })
      );

      withEvent(state, "counter_or_accept", "end", {
        round,
        round_json: roundJson,
      });

      withEvent(state, "consensus_check", "end", {
        round,
        accepted: consensus.accepted,
        reason: consensus.reason,
      });

      if (accepted) {
        break;
      }

      failReason = evaluation.retryReason ?? "pref_conflict";
    }

    const negotiationId = randomUUID();
    let datePlan: DatePlan | null = null;
    let compatibilityScore = 0;

    withEvent(state, "finalize_or_fail", "start", { accepted });
    if (accepted && acceptedProposal) {
      compatibilityScore = clamp(
        Math.round(
          buildMatchScore(state, candidate).total * 0.65 +
            state.negotiation_turns[state.negotiation_turns.length - 1].evaluation.score * 0.35
        ),
        0,
        100
      );

      const planned = runDatePlanningGraph({
        state,
        negotiationId,
        proposal: acceptedProposal,
        user: state.profile,
      });
      datePlan = planned.datePlan;
      state.date_plan = datePlan;

      state.negotiation_logs.push(
        toNegotiationLog({
          type: "Consensus",
          perception: `已达成一致并锁定待确认时段：${datePlan.venue}`,
          reasoning: "双方偏好与时间窗口满足约束",
          action: JSON.stringify({ date_plan_id: datePlan.id, status: datePlan.status }),
          status: "accepted",
          round: state.negotiation_turns.length,
          jsonPayload: {
            date_plan_id: datePlan.id,
            options: planned.options,
          },
        })
      );
    } else {
      compatibilityScore = clamp(Math.round(buildMatchScore(state, candidate).total * 0.7), 0, 80);
      state.date_plan = null;
      state.negotiation_logs.push(
        toNegotiationLog({
          type: "Consensus",
          perception: "协商失败，未达成一致方案",
          reasoning: `失败原因: ${failReason ?? "pref_conflict"}`,
          action: JSON.stringify({ retry_reason: failReason ?? "pref_conflict" }),
          status: "rejected",
          round: 3,
          jsonPayload: {
            retry_reason: failReason ?? "pref_conflict",
          },
        })
      );
    }

    withEvent(state, "finalize_or_fail", "end", {
      accepted,
      compatibility_score: compatibilityScore,
      fail_reason: failReason,
      date_plan_id: datePlan?.id,
    });

    state.active_negotiation_id = negotiationId;

    saveNegotiation({
      negotiationId,
      sessionId: state.session_id,
      candidateId: candidate.id,
      status: accepted ? "accepted" : "failed",
      turns: state.negotiation_turns.length,
      compatibilityScore,
      logs: state.negotiation_logs,
      datePlanId: datePlan?.id,
    });

    if (datePlan) {
      const planWithNegotiation = {
        ...datePlan,
        negotiation_id: negotiationId,
        session_id: state.session_id,
      };
      state.date_plan = planWithNegotiation;
      saveDatePlan(planWithNegotiation);
    }

    updateSession(state);

    return {
      negotiation_id: negotiationId,
      negotiation_logs: state.negotiation_logs,
      compatibility_score: compatibilityScore,
      date_plan: state.date_plan,
      fail_reason: accepted ? undefined : failReason,
    };
  }

  negotiationOverride(input: {
    negotiation_id: string;
    session_id: string;
    instruction: string;
    actor?: string;
    action?: "approve" | "reject" | "replan";
    overrides?: Partial<Pick<DatePlan, "venue" | "date" | "time" | "notes">>;
  }): {
    approved_plan: DatePlan | null;
    back_to_discover: boolean;
    audit: ReturnType<typeof appendAuditLog>;
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }

    const negotiation = getNegotiation(input.negotiation_id);
    if (!negotiation) {
      throw new Error("Negotiation not found");
    }

    state.human_override_instruction = input.instruction;

    withEvent(state, "show_summary", "end", {
      negotiation_id: input.negotiation_id,
      instruction: input.instruction,
    });

    const before = (state.date_plan ?? {}) as Record<string, unknown>;
    const action = input.action ?? "replan";
    const actor = input.actor ?? "human_user";

    withEvent(state, "user_override", "start", {
      action,
      actor,
      instruction: input.instruction,
    });

    let approvedPlan: DatePlan | null = state.date_plan;
    let backToDiscover = false;

    if (action === "reject") {
      approvedPlan = null;
      state.date_plan = null;
      backToDiscover = true;
    } else if (action === "approve") {
      approvedPlan = state.date_plan ? ensureLockStatus(state.date_plan) : null;
      state.date_plan = approvedPlan;
    } else {
      withEvent(state, "replan", "start", {
        has_existing_plan: Boolean(state.date_plan),
      });

      if (!state.profile) {
        throw new Error("Profile missing");
      }

      const candidate =
        state.active_candidate ??
        state.shortlist.find((item) => item.id === negotiation.negotiation.candidate_id) ??
        state.candidate_pool.find((item) => item.id === negotiation.negotiation.candidate_id);

      if (!candidate) {
        throw new Error("Active candidate missing");
      }

      const seedProposal = {
        venue:
          input.overrides?.venue ?? state.date_plan?.venue ?? pickVenue(state.profile.city, state.profile.interests).name,
        date: input.overrides?.date ?? state.date_plan?.date ?? getMockCalendarSlots()[0].date,
        time: input.overrides?.time ?? state.date_plan?.time ?? getMockCalendarSlots()[0].start,
        notes: input.overrides?.notes ?? state.date_plan?.notes ?? "人工重规划",
      };

      const replanned = runDatePlanningGraph({
        state,
        negotiationId: input.negotiation_id,
        proposal: seedProposal,
        user: state.profile,
      });

      approvedPlan = {
        ...replanned.datePlan,
        negotiation_id: input.negotiation_id,
        session_id: state.session_id,
      };
      state.date_plan = approvedPlan;

      withEvent(state, "replan", "end", {
        date_plan_id: approvedPlan.id,
      });
    }

    withEvent(state, "approve/reject", "end", {
      approved: Boolean(approvedPlan),
      back_to_discover: backToDiscover,
    });

    const after = (state.date_plan ?? {}) as Record<string, unknown>;
    const audit = appendAuditLog({
      sessionId: state.session_id,
      negotiationId: input.negotiation_id,
      actor,
      action,
      before,
      after,
    });

    state.negotiation_logs.push(
      toNegotiationLog({
        type: "Override",
        perception: `Human override: ${action}`,
        reasoning: input.instruction,
        action: JSON.stringify({ actor, action, overrides: input.overrides ?? null }),
        status: action === "reject" ? "rejected" : "accepted",
        actor,
        jsonPayload: {
          actor,
          action,
          instruction: input.instruction,
          overrides: input.overrides ?? null,
        },
      })
    );

    saveNegotiation({
      negotiationId: input.negotiation_id,
      sessionId: state.session_id,
      candidateId: negotiation.negotiation.candidate_id,
      status: action === "reject" ? "rejected_by_human" : "approved_by_human",
      turns: negotiation.negotiation.turns,
      compatibilityScore: negotiation.negotiation.compatibility_score,
      logs: state.negotiation_logs,
      datePlanId: state.date_plan?.id,
    });

    if (state.date_plan) {
      saveDatePlan(state.date_plan);
    }

    updateSession(state);

    return {
      approved_plan: state.date_plan,
      back_to_discover: backToDiscover,
      audit,
    };
  }

  confirmDate(input: {
    date_plan_id: string;
    session_id: string;
    confirm: boolean;
    actor?: string;
  }): {
    date_plan: DatePlan;
    released: boolean;
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }

    if (!state.date_plan || state.date_plan.id !== input.date_plan_id) {
      const persisted = getDatePlan(input.date_plan_id);
      if (!persisted || persisted.session_id !== input.session_id) {
        throw new Error("Date plan not found in session");
      }
      state.date_plan = persisted;
    }

    let plan = ensureLockStatus(state.date_plan);
    if (plan.status === "RELEASED") {
      state.date_plan = plan;
      saveDatePlan(plan);
      updateSession(state);
      return { date_plan: plan, released: true };
    }

    const nextStatus: DatePlanStatus = input.confirm ? "CONFIRMED" : "RELEASED";
    plan = {
      ...plan,
      status: nextStatus,
      confirmed: input.confirm,
      lock_expires_at: input.confirm ? plan.lock_expires_at : null,
    };

    state.date_plan = plan;

    withEvent(state, "notify", "end", {
      actor: input.actor ?? "human_user",
      date_plan_id: plan.id,
      status: plan.status,
    });

    saveDatePlan(plan);
    updateSession(state);

    return {
      date_plan: plan,
      released: nextStatus === "RELEASED",
    };
  }

  postDateFeedback(input: {
    session_id: string;
    candidate_id: string;
    attended: boolean;
    feedback: string;
    cancel_reason?: string;
  }): {
    updated_penalties: Record<string, number>;
    shortlist: Candidate[];
  } {
    const state = getSession(input.session_id);
    if (!state) {
      throw new Error("Session not found");
    }

    const candidate = state.candidate_pool.find((item) => item.id === input.candidate_id);
    if (!candidate) {
      throw new Error("Candidate not found");
    }

    withEvent(state, "collect_feedback", "start", {
      candidate_id: input.candidate_id,
      attended: input.attended,
    });

    const negativeSignal = !input.attended || /(差|糟糕|不合适|冲突|失望|取消)/.test(input.feedback + (input.cancel_reason ?? ""));
    const delta = negativeSignal ? NEGATIVE_FEEDBACK_PENALTY : -POSITIVE_FEEDBACK_BONUS;

    withEvent(state, "memory_update", "start", {});
    state.memories.push({
      id: randomUUID(),
      content: `约会反馈(${candidate.name}): ${input.feedback}${input.cancel_reason ? `; 取消原因: ${input.cancel_reason}` : ""}`,
      source: "feedback",
      weight: negativeSignal ? 0.92 : 0.68,
      timestamp: Date.now(),
      metadata: {
        category: negativeSignal ? "negative_feedback" : "positive_feedback",
      },
    });
    withEvent(state, "memory_update", "end", {
      memory_count: state.memories.length,
    });

    withEvent(state, "score_recalibration", "start", { delta });
    for (const interest of candidate.profile.interests) {
      const current = state.feedback_penalties[interest] ?? 0;
      state.feedback_penalties[interest] = clamp(current + delta, 0, 20);
    }
    withEvent(state, "score_recalibration", "end", {
      penalties: state.feedback_penalties,
    });

    withEvent(state, "candidate_model_update", "start", {});
    state.shortlist = state.shortlist
      .map((item) => {
        const score = buildMatchScore(state, item);
        return {
          ...item,
          composite_score: score.total,
          match_explanation: `反馈后重评分: ${score.total}`,
        };
      })
      .sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0));
    withEvent(state, "candidate_model_update", "end", {
      shortlist: state.shortlist.map((item) => ({ id: item.id, score: item.composite_score })),
    });

    updateSession(state);

    return {
      updated_penalties: state.feedback_penalties,
      shortlist: state.shortlist,
    };
  }

  getSessionState(sessionId: string): LangGraphState | null {
    return getSession(sessionId);
  }
}
