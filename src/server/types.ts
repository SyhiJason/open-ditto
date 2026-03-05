export interface UserProfile {
  name: string;
  age: number;
  city: string;
  interests: string[];
  partnerPrefs: string;
  dealbreakers: string;
  selfDescription: string;
}

export interface Memory {
  id: string;
  content: string;
  source: "questionnaire" | "chat" | "feedback";
  weight: number;
  timestamp: number;
  metadata?: {
    category?: string;
    rawJson?: Record<string, unknown>;
  };
}

export interface Candidate {
  id: string;
  name: string;
  profile: UserProfile;
  trust_score: number;
  schedule_score: number;
  risk_tags?: string[];
  match_explanation?: string;
  composite_score?: number;
}

export interface SwipeEvent {
  id: string;
  candidate_id: string;
  action: "left" | "right";
  reject_reason_tag?: string;
  timestamp: number;
}

export interface NegotiationJsonTurn {
  round: number;
  proposal: {
    venue: string;
    date: string;
    time: string;
    notes: string;
  };
  evaluation: {
    accept: boolean;
    reason: string;
    score: number;
    counter?: {
      venue?: string;
      date?: string;
      time?: string;
      notes?: string;
    };
  };
  consensus: {
    accepted: boolean;
    reason: string;
  };
}

export interface NegotiationLog {
  id: string;
  memoryId?: string;
  type: "Memory" | "Decision" | "Consensus" | "Override";
  timestamp: string;
  perception: string;
  reasoning: string;
  action: string;
  status: "accepted" | "conditional" | "rejected";
  round?: number;
  json_payload?: Record<string, unknown>;
  actor?: string;
}

export type DatePlanStatus =
  | "LOCKED_PENDING_CONFIRM"
  | "CONFIRMED"
  | "RELEASED"
  | "FAILED";

export interface DatePlan {
  id: string;
  session_id: string;
  negotiation_id: string;
  venue: string;
  date: string;
  time: string;
  notes: string;
  status: DatePlanStatus;
  confirmed: boolean;
  lock_expires_at: number | null;
}

export interface GraphError {
  id: string;
  node: string;
  message: string;
  timestamp: number;
}

export interface LangGraphState {
  user_id: string;
  session_id: string;
  profile: UserProfile | null;
  memories: Memory[];
  candidate_pool: Candidate[];
  shortlist: Candidate[];
  active_candidate: Candidate | null;
  swipe_events: SwipeEvent[];
  negotiation_turns: NegotiationJsonTurn[];
  negotiation_logs: NegotiationLog[];
  human_override_instruction: string | null;
  date_plan: DatePlan | null;
  errors: GraphError[];
  trace_id: string;
  onboarding_score: number;
  chat_turn_count: number;
  active_negotiation_id: string | null;
  feedback_penalties: Record<string, number>;
}

export interface EventRecord {
  id: number;
  session_id: string;
  node: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: number;
}

export interface NegotiationRecord {
  negotiation_id: string;
  session_id: string;
  candidate_id: string;
  status: string;
  turns: number;
  compatibility_score: number;
  logs: NegotiationLog[];
  created_at: number;
  updated_at: number;
}

export interface AuditRecord {
  id: number;
  session_id: string;
  negotiation_id: string;
  actor: string;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  created_at: number;
}
