import { motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, Agent } from "../store/useStore";
import { verifyProfile } from "../lib/mcpTools";
import { runAgentNegotiation } from "../lib/agentEngine";

// ─── Types ────────────────────────────────────────────────────────────────────

type CardAction = "like" | "skip" | null;

// ─── Single Swipe Card ────────────────────────────────────────────────────────

interface SwipeCardProps {
    key?: React.Key;
    agent: Agent;
    onSwipe: (action: CardAction, agent: Agent) => void | Promise<void>;
    isTop: boolean;
}

function SwipeCard({ agent, onSwipe, isTop }: SwipeCardProps) {
    const x = useMotionValue(0);
    const rotate = useTransform(x, [-200, 200], [-18, 18]);
    const likeOpacity = useTransform(x, [20, 100], [0, 1]);
    const skipOpacity = useTransform(x, [-100, -20], [1, 0]);

    const [isExpanded, setIsExpanded] = useState(false);
    const [verification, setVerification] = useState<{
        verified: boolean;
        confidence: number;
    } | null>(null);

    const handleVerify = async () => {
        const result = await verifyProfile("instagram", agent.name.toLowerCase());
        setVerification({ verified: result.verified, confidence: result.confidence });
    };

    const handleDragEnd = (_: any, info: any) => {
        if (info.offset.x > 120) {
            onSwipe("like", agent);
        } else if (info.offset.x < -120) {
            onSwipe("skip", agent);
        }
    };

    const profile = agent.profile;

    return (
        <motion.div
            style={{ x, rotate }}
            drag={isTop ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={handleDragEnd}
            className={`absolute inset-0 cursor-grab active:cursor-grabbing select-none ${isTop ? "z-20" : "z-10"
                }`}
            initial={isTop ? { scale: 1 } : { scale: 0.95, y: 12 }}
            animate={isTop ? { scale: 1, y: 0 } : { scale: 0.95, y: 12 }}
        >
            <div className="w-full h-full glass-card rounded-3xl overflow-hidden flex flex-col">
                {/* Like / Skip Indicators */}
                <motion.div
                    style={{ opacity: likeOpacity }}
                    className="absolute top-8 left-8 z-30 px-4 py-2 rounded-xl border-2 border-emerald text-emerald font-display font-bold text-xl rotate-[-15deg]"
                >
                    RIGHT ✓
                </motion.div>
                <motion.div
                    style={{ opacity: skipOpacity }}
                    className="absolute top-8 right-8 z-30 px-4 py-2 rounded-xl border-2 border-magenta text-magenta font-display font-bold text-xl rotate-[15deg]"
                >
                    SKIP ✕
                </motion.div>

                {/* Avatar Section */}
                <div className="relative h-[55%] bg-gradient-to-b from-void/0 to-void flex-shrink-0">
                    <img
                        src={agent.avatarUrl}
                        alt={agent.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />

                    {/* Match Score Badge */}
                    <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full glass-card border border-neon/40 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse" />
                        <span className="font-mono text-xs text-neon font-bold">{agent.score}% 匹配</span>
                    </div>

                    {/* Verify Badge */}
                    {verification ? (
                        <div
                            className={`absolute top-4 left-4 px-3 py-1.5 rounded-full glass-card border flex items-center gap-1.5 ${verification.verified ? "border-emerald/50 text-emerald" : "border-amber/50 text-amber"
                                }`}
                        >
                            <span className="text-xs font-bold">
                                {verification.verified ? "✓ 已验证" : "⚠ 待核实"}
                            </span>
                        </div>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); handleVerify(); }}
                            className="absolute top-4 left-4 px-3 py-1.5 rounded-full glass-card border border-white/20 text-xs text-tertiary hover:text-white hover:border-white/40 transition-all"
                        >
                            验证主页
                        </button>
                    )}
                </div>

                {/* Info Section */}
                <div className="flex-1 p-6 flex flex-col gap-3">
                    <div>
                        <h2 className="font-display font-bold text-2xl">
                            {profile?.name ?? agent.name}
                        </h2>
                        <p className="text-secondary text-sm">
                            {profile?.age} 岁 · {profile?.city}
                        </p>
                    </div>

                    {/* Interest Tags */}
                    <div className="flex flex-wrap gap-1.5">
                        {profile?.interests.slice(0, 4).map((tag) => (
                            <span
                                key={tag}
                                className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-tertiary"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* Self-description */}
                    {isExpanded && profile && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="text-sm text-secondary leading-relaxed border-t border-white/10 pt-3"
                        >
                            <p className="mb-2">{profile.selfDescription}</p>
                            <p className="text-xs text-tertiary">
                                <span className="text-quantum">寻找：</span> {profile.partnerPrefs}
                            </p>
                        </motion.div>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                        className="text-xs text-neon/60 hover:text-neon transition-colors self-start"
                    >
                        {isExpanded ? "收起 ↑" : "了解更多 ↓"}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Negotiation Result Modal ─────────────────────────────────────────────────

type ModalState =
    | { type: "success" }
    | { type: "rejected"; message: string }
    | { type: "error"; message: string };

function NegotiationResultModal({
    state,
    onClose,
}: {
    state: ModalState;
    onClose: () => void;
}) {
    const { datePlan, activeMatchId, matchAgents } = useStore();
    const navigate = useNavigate();
    const matchAgent = matchAgents.find((a) => a.id === activeMatchId);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4"
        >
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 25 }}
                className="w-full max-w-lg glass-card rounded-3xl p-8"
            >
                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className={`w-10 h-10 rounded-full border flex items-center justify-center ${state.type === "success"
                            ? "bg-emerald/20 border-emerald/50"
                            : "bg-amber/20 border-amber/50"
                        }`}>
                        <span className={`text-lg ${state.type === "success" ? "text-emerald" : "text-amber"}`}>
                            {state.type === "success" ? "✓" : "!"}
                        </span>
                    </div>
                    <div>
                        <h3 className="font-display font-bold text-lg">
                            {state.type === "success" ? "约会已安排！" : "本次未达成一致"}
                        </h3>
                        <p className="text-secondary text-xs">
                            {state.type === "success"
                                ? `${matchAgent?.profile?.name} 的 Agent 已确认`
                                : matchAgent?.profile?.name
                                    ? `你和 ${matchAgent.profile.name} 的 Agent 需要更多沟通`
                                    : "需要更多偏好信息再继续协商"}
                        </p>
                    </div>
                </div>

                {state.type === "success" && datePlan ? (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6 flex flex-col gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon">
                                📍
                            </div>
                            <div>
                                <p className="text-xs text-tertiary">地点</p>
                                <p className="font-medium text-white">{datePlan.venue}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-quantum/10 border border-quantum/30 flex items-center justify-center text-quantum">
                                🗓
                            </div>
                            <div>
                                <p className="text-xs text-tertiary">时间</p>
                                <p className="font-medium text-white">{datePlan.date} · {datePlan.time}</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
                        <p className="text-sm text-secondary leading-relaxed">
                            {state.type === "success" ? "" : state.message}
                        </p>
                    </div>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={() => navigate("/resonance")}
                        className="flex-1 py-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-white hover:bg-white/10 transition-all"
                    >
                        查看协商过程
                    </button>
                    <button
                        onClick={onClose}
                        className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all ${state.type === "success"
                                ? "bg-emerald/20 border border-emerald/40 text-emerald hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
                                : "bg-amber/20 border border-amber/40 text-amber hover:shadow-[0_0_20px_rgba(255,184,0,0.25)]"
                            }`}
                    >
                        {state.type === "success" ? "太棒了 ✓" : "继续挑选"}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// ─── Main Discover Page ───────────────────────────────────────────────────────

export function Discover() {
    const { matchAgents, userAgent, setActiveMatch, addNegotiationLog, setDatePlan, updateMatchScore } = useStore();
    const navigate = useNavigate();

    const [cards, setCards] = useState([...matchAgents].sort((a, b) => b.score - a.score));
    const [isNegotiating, setIsNegotiating] = useState(false);
    const [modalState, setModalState] = useState<ModalState | null>(null);

    const handleSwipe = async (action: CardAction, agent: Agent) => {
        setCards((prev) => prev.filter((c) => c.id !== agent.id));

        if (action === "like") {
            setIsNegotiating(true);
            setActiveMatch(agent.id);

            try {
                const result = await runAgentNegotiation(userAgent, agent);

                // Update score and logs
                updateMatchScore(agent.id, result.compatibilityScore);
                result.logs.forEach(addNegotiationLog);
                setDatePlan(result.datePlan);

                if (result.datePlan) {
                    setModalState({ type: "success" });
                } else {
                    setModalState({
                        type: "rejected",
                        message: result.summary,
                    });
                }
            } catch (err) {
                setDatePlan(null);
                addNegotiationLog({
                    id: crypto.randomUUID(),
                    type: "Consensus",
                    timestamp: new Date().toLocaleTimeString(),
                    perception: "协商中断：模型请求失败。",
                    reasoning: err instanceof Error ? err.message : "Unknown error",
                    action: 'retry_negotiation()',
                    status: "rejected",
                });
                setModalState({
                    type: "error",
                    message: "AI 协商失败，请稍后重试。",
                });
            } finally {
                setIsNegotiating(false);
            }
        }
    };

    const allSwiped = cards.length === 0;

    return (
        <div className="min-h-screen bg-void pt-[72px] flex flex-col items-center justify-center px-4 relative">
            {/* Background */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-magenta/5 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-sm">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="font-display font-bold text-2xl mb-1">发现</h1>
                    <p className="text-secondary text-xs">
                        {cards.length > 0
                            ? `${cards.length} 位候选 · 右滑让 Agent 安排约会`
                            : "今天已经看完了"}
                    </p>
                </div>

                {/* Card Stack */}
                <div className="relative w-full aspect-[3/4] mb-6">
                    {allSwiped ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 glass-card rounded-3xl flex flex-col items-center justify-center gap-4"
                        >
                            <span className="text-5xl">✨</span>
                            <p className="font-display font-bold text-xl">全部看完了！</p>
                            <p className="text-secondary text-sm text-center px-8">
                                你的 Agent 正在为你筛选最合适的匹配
                            </p>
                            <button
                                onClick={() => navigate("/chronicle")}
                                className="mt-4 px-6 py-3 rounded-xl bg-neon/20 border border-neon/40 text-neon text-sm font-bold hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all"
                            >
                                查看决策记录 →
                            </button>
                        </motion.div>
                    ) : (
                        <AnimatePresence>
                            {cards.slice(0, 2).map((agent, i) => (
                                <SwipeCard
                                    key={agent.id}
                                    agent={agent}
                                    onSwipe={handleSwipe}
                                    isTop={i === 0}
                                />
                            ))}
                        </AnimatePresence>
                    )}
                </div>

                {/* Action Buttons */}
                {!allSwiped && (
                    <div className="flex justify-center gap-6">
                        <button
                            onClick={() => cards[0] && handleSwipe("skip", cards[0])}
                            className="w-14 h-14 rounded-full glass-card border border-magenta/30 flex items-center justify-center text-magenta text-xl hover:shadow-[0_0_20px_rgba(255,0,110,0.3)] transition-all hover:scale-105 active:scale-95"
                        >
                            ✕
                        </button>
                        <button
                            onClick={() => navigate("/")}
                            className="w-10 h-10 rounded-full glass-card border border-white/10 flex items-center justify-center text-tertiary text-sm hover:text-white transition-all self-center"
                        >
                            ★
                        </button>
                        <button
                            onClick={() => cards[0] && handleSwipe("like", cards[0])}
                            className="w-14 h-14 rounded-full glass-card border border-emerald/30 flex items-center justify-center text-emerald text-xl hover:shadow-[0_0_20px_rgba(0,255,136,0.3)] transition-all hover:scale-105 active:scale-95"
                        >
                            ✓
                        </button>
                    </div>
                )}
            </div>

            {/* Negotiating Overlay */}
            <AnimatePresence>
                {isNegotiating && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-void/80 backdrop-blur-md"
                    >
                        <motion.div
                            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="w-24 h-24 rounded-full bg-gradient-to-br from-neon to-quantum mb-6 shadow-[0_0_60px_rgba(0,240,255,0.6)]"
                        />
                        <p className="font-display font-bold text-xl mb-2">Agent 正在协商中...</p>
                        <p className="text-secondary text-sm">检查日历 · 分析偏好 · 匹配场景</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Negotiation Result Modal */}
            {modalState && (
                <NegotiationResultModal
                    state={modalState}
                    onClose={() => setModalState(null)}
                />
            )}
        </div>
    );
}
