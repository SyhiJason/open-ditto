import { create } from "zustand";
import { persist } from "zustand/middleware";

// ─── Core Types ────────────────────────────────────────────────────────────

export type AgentState = "Idle" | "Reflecting" | "Negotiating" | "Confirmed";

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
  content: string;    // What the agent remembers
  source: "questionnaire" | "chat";
  weight: number;     // Relevance weight for RAG (0–1)
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
}

export interface Agent {
  id: string;
  name: string;
  state: AgentState;
  score: number;          // Match compatibility score (0–100)
  avatarUrl: string;
  x: number;
  y: number;
  profile?: UserProfile;
  memories: Memory[];
  chatHistory: ChatMessage[];
}

export interface DatePlan {
  venue: string;
  time: string;
  date: string;
  notes: string;
  confirmed: boolean;
}

export interface NegotiationLog {
  id: string;
  type: "Memory" | "Decision" | "Consensus";
  timestamp: string;
  perception: string;
  reasoning: string;
  action: string;
  status: "accepted" | "conditional" | "rejected";
}

// ─── App State ─────────────────────────────────────────────────────────────

interface AppState {
  // Onboarding
  onboardingComplete: boolean;
  userProfile: UserProfile | null;

  // Agents
  userAgent: Agent;
  matchAgents: Agent[];

  // Active match session
  activeMatchId: string | null;
  negotiationLogs: NegotiationLog[];
  datePlan: DatePlan | null;

  // ── Actions ──────────────────────────────────────────────────────────────

  // Onboarding
  setUserProfile: (profile: UserProfile) => void;
  completeOnboarding: () => void;

  // Chat / Memory
  addChatMessage: (msg: ChatMessage) => void;
  addMemory: (memory: Memory) => void;

  // Agent positions / state
  setUserAgentPosition: (x: number, y: number) => void;
  setMatchAgentPosition: (id: string, x: number, y: number) => void;
  setAgentState: (id: string, state: AgentState) => void;

  // Match session
  setActiveMatch: (id: string) => void;
  addNegotiationLog: (log: NegotiationLog) => void;
  setDatePlan: (plan: DatePlan) => void;
  updateMatchScore: (id: string, score: number) => void;
}

// ─── Default State ─────────────────────────────────────────────────────────

const defaultAgent: Agent = {
  id: "user",
  name: "My Agent",
  state: "Idle",
  score: 100,
  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=user&backgroundColor=b6e3f4",
  x: 0,
  y: 0,
  memories: [],
  chatHistory: [],
};

const defaultMatchAgents: Agent[] = [
  {
    id: "match1",
    name: "Aria",
    state: "Reflecting",
    score: 92,
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=aria&backgroundColor=ffdfbf",
    x: -200,
    y: -100,
    memories: [],
    chatHistory: [],
    profile: {
      name: "Aria",
      age: 27,
      city: "上海",
      interests: ["徒步", "摄影", "咖啡", "文学"],
      partnerPrefs: "开朗、有好奇心、喜欢户外活动",
      dealbreakers: "不喜欢吸烟者",
      selfDescription: "热爱生活的摄影师，周末喜欢探索城市角落",
    },
  },
  {
    id: "match2",
    name: "Lucas",
    state: "Negotiating",
    score: 85,
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=lucas&backgroundColor=c0aede",
    x: 200,
    y: 100,
    memories: [],
    chatHistory: [],
    profile: {
      name: "Lucas",
      age: 29,
      city: "北京",
      interests: ["爵士乐", "烹饪", "电影", "骑行"],
      partnerPrefs: "独立、有品味、喜欢安静的约会场所",
      dealbreakers: "不喜欢过于依赖的人",
      selfDescription: "音乐人兼厨师，最快乐的时光是为喜欢的人做饭",
    },
  },
  {
    id: "match3",
    name: "Mei",
    state: "Idle",
    score: 78,
    avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=mei&backgroundColor=d1f4d0",
    x: 0,
    y: 200,
    memories: [],
    chatHistory: [],
    profile: {
      name: "Mei",
      age: 25,
      city: "深圳",
      interests: ["瑜伽", "旅行", "设计", "冥想"],
      partnerPrefs: "温柔、有耐心、对未来有规划",
      dealbreakers: "不喜欢不守时的人",
      selfDescription: "UX 设计师，相信美好的体验改变生活",
    },
  },
];

// ─── Store ──────────────────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      userProfile: null,
      userAgent: defaultAgent,
      matchAgents: defaultMatchAgents,
      activeMatchId: null,
      negotiationLogs: [],
      datePlan: null,

      // ── Onboarding ────────────────────────────────────────────────────────
      setUserProfile: (profile) =>
        set((state) => ({
          userProfile: profile,
          userAgent: {
            ...state.userAgent,
            name: profile.name + "'s Agent",
            profile,
          },
        })),

      completeOnboarding: () => set({ onboardingComplete: true }),

      // ── Chat / Memory ─────────────────────────────────────────────────────
      addChatMessage: (msg) =>
        set((state) => ({
          userAgent: {
            ...state.userAgent,
            chatHistory: [...state.userAgent.chatHistory, msg],
          },
        })),

      addMemory: (memory) =>
        set((state) => ({
          userAgent: {
            ...state.userAgent,
            memories: [...state.userAgent.memories, memory],
          },
        })),

      // ── Positions / State ─────────────────────────────────────────────────
      setUserAgentPosition: (x, y) =>
        set((state) => ({
          userAgent: { ...state.userAgent, x, y },
        })),

      setMatchAgentPosition: (id, x, y) =>
        set((state) => ({
          matchAgents: state.matchAgents.map((agent) =>
            agent.id === id ? { ...agent, x, y } : agent
          ),
        })),

      setAgentState: (id, agentState) =>
        set((state) => {
          if (id === "user") {
            return { userAgent: { ...state.userAgent, state: agentState } };
          }
          return {
            matchAgents: state.matchAgents.map((agent) =>
              agent.id === id ? { ...agent, state: agentState } : agent
            ),
          };
        }),

      // ── Match Session ─────────────────────────────────────────────────────
      setActiveMatch: (id) => set({ activeMatchId: id, negotiationLogs: [] }),

      addNegotiationLog: (log) =>
        set((state) => ({
          negotiationLogs: [...state.negotiationLogs, log],
        })),

      setDatePlan: (plan) => set({ datePlan: plan }),

      updateMatchScore: (id, score) =>
        set((state) => ({
          matchAgents: state.matchAgents.map((agent) =>
            agent.id === id ? { ...agent, score } : agent
          ),
        })),
    }),
    {
      name: "open-ditto-store",
      // Only persist profile & memories — reset agent positions each session
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        userProfile: state.userProfile,
        userAgent: {
          ...state.userAgent,
          x: 0,
          y: 0,
          state: "Idle" as AgentState,
        },
      }),
    }
  )
);
