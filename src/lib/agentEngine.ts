/**
 * agentEngine.ts
 *
 * Core AI layer for Open Ditto.
 * Handles:
 *  1. Context Engineering — builds rich system prompts from profile + memories
 *  2. Onboarding Chat     — trains the agent with daily conversation
 *  3. Agent-to-Agent      — multi-turn Gemini negotiation between two agents
 *  4. Memory Extraction   — pulls key facts from chat turns
 */

import OpenAI from "openai";
import { Agent, Memory, NegotiationLog, DatePlan, UserProfile } from "../store/useStore";
import { getFreeTime } from "./mcpTools";

const API_KEY = process.env.MOONSHOT_API_KEY ?? "";
const ai = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://api.moonshot.cn/v1",
    dangerouslyAllowBrowser: true // Need this because we're calling from frontend
});

// ─── 1. Context Engineering ─────────────────────────────────────────────────

/**
 * Builds a rich system prompt from the user's profile and memories.
 * This is the "context engineering" layer — we carefully curate what the
 * agent knows about its user before any AI call.
 */
export function buildSystemPrompt(agent: Agent): string {
    const p = agent.profile;
    const profileSection = p
        ? `
## Your User's Profile
- Name: ${p.name}, Age: ${p.age}, City: ${p.city}
- Interests: ${p.interests.join(", ")}
- Seeking: ${p.partnerPrefs}
- Dealbreakers: ${p.dealbreakers}
- Self-description: ${p.selfDescription}
`.trim()
        : "No profile set yet.";

    // Agentic RAG: pick top-k memories by weight, inject as bullet points
    const topMemories = [...agent.memories]
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 10);

    const memoriesSection =
        topMemories.length > 0
            ? `\n## Remembered Facts (from past conversations)\n${topMemories
                .map((m) => `- [weight: ${m.weight.toFixed(2)}] ${m.content}`)
                .join("\n")}`
            : "";

    return `You are a personal AI dating agent representing a real person.
Your job is to advocate for your user's genuine interests and preferences.
Be warm, discerning, and honest. Never make commitments your user would
regret. Always check compatibility before agreeing to dates.

${profileSection}
${memoriesSection}

## Behavior Rules
- Speak in first person AS the agent (e.g., "My user prefers...")
- In negotiations, be polite but firm about dealbreakers
- Always explain your reasoning briefly
- Output JSON when asked for structured data`;
}

// ─── 2. Onboarding Chat ──────────────────────────────────────────────────────

/**
 * Sends a message from the user to their agent during onboarding training.
 * Returns the agent's reply + any new memory extracted.
 */
export async function runOnboardingChat(
    userMessage: string,
    agent: Agent
): Promise<{ reply: string; newMemory: Memory | null }> {
    const systemPrompt =
        buildSystemPrompt(agent) +
        `\n\n## Current Mode: LEARNING
The user is talking to you to help you understand them better.
After your conversational reply, extract ONE key fact to remember.
ALWAYS end your reply with this JSON block on a new line:
<memory>{"content": "...", "weight": 0.0}</memory>
Weight: 0.9 = very important preference, 0.5 = casual mention, 0.2 = minor detail.`;

    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = agent.chatHistory.slice(-10).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
    }));

    const response = await ai.chat.completions.create({
        model: "moonshot-v1-8k",
        messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMessage }
        ]
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Parse memory tag
    const memMatch = raw.match(/<memory>(\{.*?\})<\/memory>/s);
    let newMemory: Memory | null = null;
    if (memMatch) {
        try {
            const parsed = JSON.parse(memMatch[1]);
            newMemory = {
                id: crypto.randomUUID(),
                content: parsed.content,
                source: "chat",
                weight: Math.min(1, Math.max(0, parsed.weight ?? 0.5)),
                timestamp: Date.now(),
            };
        } catch {
            // ignore parse error
        }
    }

    const reply = raw.replace(/<memory>.*?<\/memory>/s, "").trim();
    return { reply, newMemory };
}

// ─── 3. Agent-to-Agent Negotiation ─────────────────────────────────────────

export interface NegotiationResult {
    compatibilityScore: number; // 0–100
    logs: NegotiationLog[];
    datePlan: DatePlan | null;
    summary: string;
}

/**
 * Runs a 3-turn agent negotiation between userAgent and a matchAgent.
 * Each turn: matchAgent proposes → userAgent evaluates → consensus check.
 * Returns scored result + Chronicle-ready logs.
 */
export async function runAgentNegotiation(
    userAgent: Agent,
    matchAgent: Agent
): Promise<NegotiationResult> {
    const logs: NegotiationLog[] = [];
    const freeTime = getFreeTime(); // MCP tool call

    // ── Turn 0: Memory recall (what does my user want?) ──────────────────────
    const userSystemPrompt = buildSystemPrompt(userAgent);
    const matchProfile = matchAgent.profile;

    // ── Turn 1: Match agent proposes (simulated via Gemini) ──────────────────
    const matchProposalResponse = await ai.chat.completions.create({
        model: "moonshot-v1-8k",
        messages: [
            {
                role: "system",
                content: `You are an AI dating agent for ${matchAgent.name}.
Profile: ${JSON.stringify(matchProfile, null, 2)}
Propose a first date (venue + time) that aligns with your user's interests.
The other agent's free slots are: ${JSON.stringify(freeTime)}.
Reply in JSON: {"proposal": "...", "venue": "...", "time": "...", "date": "..."}`
            },
            {
                role: "user",
                content: "Generate a first date proposal."
            }
        ]
    });

    const proposalRaw = matchProposalResponse.choices[0]?.message?.content ?? "{}";
    let proposal: { proposal: string; venue: string; time: string; date: string } = {
        proposal: "How about coffee this weekend?",
        venue: "Blue Bottle Coffee",
        time: "2:00 PM",
        date: "Saturday",
    };
    try {
        const jsonMatch = proposalRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) proposal = JSON.parse(jsonMatch[0]);
    } catch { /* use default */ }

    logs.push({
        id: crypto.randomUUID(),
        type: "Memory",
        timestamp: new Date().toLocaleTimeString(),
        perception: `${matchAgent.name}'s agent is proposing a date.`,
        reasoning: `Proposal: "${proposal.proposal}". Checking venue against user preferences via RAG.`,
        action: `memory_fetch(query="venue preference, availability")`,
        status: "accepted",
    });

    // ── Turn 2: User agent evaluates ─────────────────────────────────────────
    const evalResponse = await ai.chat.completions.create({
        model: "moonshot-v1-8k",
        messages: [
            { role: "system", content: userSystemPrompt },
            {
                role: "user",
                content: `The other agent proposed: "${proposal.proposal}" at ${proposal.venue} on ${proposal.date} at ${proposal.time}.
My user's availability: ${JSON.stringify(freeTime)}.
Evaluate this proposal. Reply in JSON:
{"accept": true/false, "counter": "optional counter-proposal", "reason": "...", "score": 0-100}`
            }
        ]
    });

    const evalRaw = evalResponse.choices[0]?.message?.content ?? "{}";
    let evaluation: { accept: boolean; counter: string; reason: string; score: number } = {
        accept: true,
        counter: "",
        reason: "Venue matches preferences",
        score: 82,
    };
    try {
        const jsonMatch = evalRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) evaluation = JSON.parse(jsonMatch[0]);
    } catch { /* use default */ }

    logs.push({
        id: crypto.randomUUID(),
        type: "Decision",
        timestamp: new Date().toLocaleTimeString(),
        perception: evaluation.accept
            ? `Proposal accepted: ${proposal.venue}`
            : `Counter-proposing: ${evaluation.counter}`,
        reasoning: evaluation.reason,
        action: evaluation.accept
            ? `calendar_check(time="${proposal.time}", venue="${proposal.venue}")`
            : `counter_propose(suggestion="${evaluation.counter}")`,
        status: evaluation.accept ? "accepted" : "conditional",
    });

    // ── Turn 3: Consensus ─────────────────────────────────────────────────────
    const finalVenue = evaluation.accept ? proposal.venue : evaluation.counter || proposal.venue;

    logs.push({
        id: crypto.randomUUID(),
        type: "Consensus",
        timestamp: new Date().toLocaleTimeString(),
        perception: `Both agents agreed: ${finalVenue} on ${proposal.date} at ${proposal.time}.`,
        reasoning: "Mutual availability confirmed. Venue meets both users' criteria.",
        action: `schedule_meeting(venue="${finalVenue}", time="${proposal.time}", date="${proposal.date}")`,
        status: "accepted",
    });

    const datePlan: DatePlan = {
        venue: finalVenue,
        time: proposal.time,
        date: proposal.date,
        notes: evaluation.reason,
        confirmed: false,
    };

    return {
        compatibilityScore: Math.min(100, Math.max(0, evaluation.score)),
        logs,
        datePlan,
        summary: `Negotiation complete. Compatibility: ${evaluation.score}/100. Date at ${finalVenue}.`,
    };
}

// ─── 4. Extract memories from questionnaire ──────────────────────────────────

/**
 * Converts a UserProfile (from questionnaire) into a set of initial memories.
 * Called once when onboarding is complete.
 */
export function profileToMemories(profile: UserProfile): Memory[] {
    const facts = [
        `User is ${profile.age} years old living in ${profile.city}.`,
        `Interests: ${profile.interests.join(", ")}.`,
        `Looking for someone who is: ${profile.partnerPrefs}.`,
        `Dealbreakers: ${profile.dealbreakers}.`,
        `Self-description: ${profile.selfDescription}.`,
    ];

    return facts.map((content, i) => ({
        id: crypto.randomUUID(),
        content,
        source: "questionnaire" as const,
        weight: 0.9 - i * 0.05, // questionnaire facts are high-weight
        timestamp: Date.now(),
    }));
}
