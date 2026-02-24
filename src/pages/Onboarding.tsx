import { motion, AnimatePresence } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore, UserProfile, ChatMessage, Memory } from "../store/useStore";
import { runOnboardingChat, profileToMemories } from "../lib/agentEngine";

// ─── Questionnaire Steps ─────────────────────────────────────────────────────

interface Step {
    key: keyof UserProfile | "interests_tags";
    label: string;
    placeholder: string;
    type: "text" | "number" | "textarea" | "tags";
    hint?: string;
}

const INTEREST_OPTIONS = [
    "咖啡", "徒步", "摄影", "音乐", "电影", "烹饪", "阅读", "旅行",
    "健身", "瑜伽", "艺术", "设计", "编程", "游戏", "美食", "音乐会",
];

const STEPS: Step[] = [
    { key: "name", label: "你叫什么？", placeholder: "你的名字", type: "text", hint: "你的 Agent 会以此称呼你" },
    { key: "age", label: "你今年多大？", placeholder: "年龄", type: "number" },
    { key: "city", label: "你住在哪座城市？", placeholder: "城市", type: "text" },
    { key: "interests_tags", label: "你有哪些兴趣爱好？", placeholder: "", type: "tags", hint: "选择 3–5 个" },
    { key: "partnerPrefs", label: "你希望对方是什么样的人？", placeholder: "描述你理想中的伴侣...", type: "textarea" },
    { key: "dealbreakers", label: "有什么是绝对无法接受的？", placeholder: "例如：吸烟、不守时...", type: "textarea" },
    { key: "selfDescription", label: "用一句话介绍一下自己吧。", placeholder: "我是一个...", type: "textarea", hint: "你的 Agent 会用这句话代表你" },
];

// ─── Main Component ──────────────────────────────────────────────────────────

export function Onboarding() {
    const navigate = useNavigate();
    const { setUserProfile, completeOnboarding, addChatMessage, addMemory, userAgent } = useStore();

    const [step, setStep] = useState(0);
    const [phase, setPhase] = useState<"questionnaire" | "chat">("questionnaire");

    // Questionnaire state
    const [formData, setFormData] = useState<Partial<UserProfile & { interests_tags: string[] }>>({
        interests: [],
    });
    const [fieldValue, setFieldValue] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Chat state
    const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string }[]>([
        {
            role: "agent",
            text: `你好！我是你的专属 Ditto Agent 🌟\n\n我已经了解了你的基本信息。现在聊聊日常，帮我更好地了解你的性格和喜好吧——这会让我在帮你匹配时更准确。`,
        },
    ]);
    const [chatInput, setChatInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [chatCount, setChatCount] = useState(0);

    // ── Questionnaire Logic ───────────────────────────────────────────────────

    const currentStep = STEPS[step];

    const handleNext = () => {
        const value =
            currentStep.type === "tags"
                ? selectedTags
                : currentStep.type === "number"
                    ? parseInt(fieldValue)
                    : fieldValue;

        if (currentStep.type === "tags" && selectedTags.length < 1) return;
        if (currentStep.type !== "tags" && !fieldValue.trim()) return;

        const newData = {
            ...formData,
            [currentStep.key === "interests_tags" ? "interests" : currentStep.key]: value,
        };
        setFormData(newData);
        setFieldValue("");

        if (step < STEPS.length - 1) {
            setStep(step + 1);
        } else {
            // Complete questionnaire
            const profile: UserProfile = {
                name: (newData.name as string) ?? "",
                age: (newData.age as number) ?? 0,
                city: (newData.city as string) ?? "",
                interests: (newData.interests as string[]) ?? [],
                partnerPrefs: (newData.partnerPrefs as string) ?? "",
                dealbreakers: (newData.dealbreakers as string) ?? "",
                selfDescription: (newData.selfDescription as string) ?? "",
            };
            setUserProfile(profile);

            // Seed initial memories from questionnaire
            const memories = profileToMemories(profile);
            memories.forEach(addMemory);

            setPhase("chat");
        }
    };

    const toggleTag = (tag: string) => {
        setSelectedTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    };

    // ── Chat Logic ─────────────────────────────────────────────────────────────

    const handleSendChat = async () => {
        if (!chatInput.trim() || isLoading) return;
        const text = chatInput.trim();
        setChatInput("");

        setMessages((prev) => [...prev, { role: "user", text }]);
        setIsLoading(true);

        // Add to store
        const userMsg: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            text,
            timestamp: Date.now(),
        };
        addChatMessage(userMsg);

        try {
            const { reply, newMemory } = await runOnboardingChat(text, userAgent);
            setMessages((prev) => [...prev, { role: "agent", text: reply }]);

            const agentMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "agent",
                text: reply,
                timestamp: Date.now(),
            };
            addChatMessage(agentMsg);

            if (newMemory) {
                addMemory(newMemory);
            }

            const newCount = chatCount + 1;
            setChatCount(newCount);

            // After 3 exchanges, offer to enter Starfield
            if (newCount >= 3) {
                setMessages((prev) => [
                    ...prev,
                    {
                        role: "agent",
                        text: "✨ 很好，我已经对你有了足够的了解！让我去星图中为你寻找合适的灵魂吧。",
                    },
                ]);
            }
        } catch (err) {
            setMessages((prev) => [
                ...prev,
                { role: "agent", text: "（出了点小问题，请稍后再试...）" },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFinish = () => {
        completeOnboarding();
        navigate("/");
    };

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-void flex items-center justify-center px-4 relative overflow-hidden">
            {/* Background glow blobs */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-neon/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-magenta/5 blur-[100px] pointer-events-none" />

            <AnimatePresence mode="wait">
                {phase === "questionnaire" ? (
                    <motion.div
                        key="questionnaire"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        className="w-full max-w-lg"
                    >
                        {/* Header */}
                        <div className="mb-12 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-16 h-16 rounded-2xl bg-neon/10 border border-neon/30 flex items-center justify-center mx-auto mb-6"
                            >
                                <span className="text-2xl">✦</span>
                            </motion.div>
                            <h1 className="font-display font-bold text-3xl mb-2">训练你的 Agent</h1>
                            <p className="text-secondary text-sm">
                                你的 Agent 将代表你，在星图中寻找灵魂伴侣
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div className="flex gap-1.5 mb-10">
                            {STEPS.map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 h-0.5 rounded-full transition-all duration-500"
                                    style={{
                                        background:
                                            i < step
                                                ? "var(--color-neon)"
                                                : i === step
                                                    ? "rgba(0,240,255,0.4)"
                                                    : "rgba(255,255,255,0.1)",
                                    }}
                                />
                            ))}
                        </div>

                        {/* Question */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 40 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -40 }}
                                transition={{ duration: 0.3 }}
                            >
                                <label className="block font-display font-bold text-2xl mb-2">
                                    {currentStep.label}
                                </label>
                                {currentStep.hint && (
                                    <p className="text-secondary text-xs mb-6">{currentStep.hint}</p>
                                )}

                                {/* Tags input */}
                                {currentStep.type === "tags" ? (
                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {INTEREST_OPTIONS.map((tag) => (
                                            <button
                                                key={tag}
                                                onClick={() => toggleTag(tag)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selectedTags.includes(tag)
                                                        ? "bg-neon text-void shadow-[0_0_15px_rgba(0,240,255,0.4)]"
                                                        : "bg-white/5 border border-white/10 text-tertiary hover:border-neon/40 hover:text-neon"
                                                    }`}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                ) : currentStep.type === "textarea" ? (
                                    <textarea
                                        value={fieldValue}
                                        onChange={(e) => setFieldValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && e.metaKey) handleNext();
                                        }}
                                        placeholder={currentStep.placeholder}
                                        rows={3}
                                        autoFocus
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-white/20 focus:outline-none focus:border-neon/60 focus:ring-1 focus:ring-neon/30 transition-all resize-none mb-6 font-sans text-sm"
                                    />
                                ) : (
                                    <input
                                        type={currentStep.type}
                                        value={fieldValue}
                                        onChange={(e) => setFieldValue(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleNext()}
                                        placeholder={currentStep.placeholder}
                                        autoFocus
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-white placeholder-white/20 focus:outline-none focus:border-neon/60 focus:ring-1 focus:ring-neon/30 transition-all mb-6 font-sans text-lg"
                                    />
                                )}

                                {/* Navigation */}
                                <div className="flex justify-between items-center">
                                    <button
                                        onClick={() => step > 0 && setStep(step - 1)}
                                        className={`text-sm text-tertiary hover:text-white transition-colors ${step === 0 ? "opacity-0 pointer-events-none" : ""
                                            }`}
                                    >
                                        ← 上一步
                                    </button>
                                    <button
                                        onClick={handleNext}
                                        className="px-8 py-3 rounded-xl bg-neon text-void font-display font-bold text-sm hover:shadow-[0_0_25px_rgba(0,240,255,0.5)] transition-all duration-300 active:scale-95"
                                    >
                                        {step === STEPS.length - 1 ? "完成 →" : "下一步 →"}
                                    </button>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                ) : (
                    /* ── Chat Phase ──────────────────────────────────────────────── */
                    <motion.div
                        key="chat"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-lg"
                    >
                        <div className="text-center mb-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", delay: 0.2 }}
                                className="w-16 h-16 rounded-full bg-gradient-to-br from-neon to-quantum flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(0,240,255,0.4)]"
                            >
                                <span className="text-2xl">🤖</span>
                            </motion.div>
                            <h2 className="font-display font-bold text-2xl mb-1">和你的 Agent 聊聊</h2>
                            <p className="text-secondary text-xs">聊 3 条以上，帮它更好地了解你</p>
                        </div>

                        {/* Chat Bubbles */}
                        <div className="glass-card rounded-3xl p-6 mb-4 h-[360px] overflow-y-auto flex flex-col gap-4">
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                    <div
                                        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${msg.role === "user"
                                                ? "bg-neon/20 border border-neon/30 text-white"
                                                : "bg-white/5 border border-white/10 text-white"
                                            }`}
                                    >
                                        {msg.text}
                                    </div>
                                </motion.div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex gap-1">
                                        {[0, 0.15, 0.3].map((d) => (
                                            <motion.div
                                                key={d}
                                                className="w-1.5 h-1.5 rounded-full bg-neon"
                                                animate={{ opacity: [0.3, 1, 0.3] }}
                                                transition={{ duration: 1, delay: d, repeat: Infinity }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                                placeholder="告诉你的 Agent 更多关于你的事..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-neon/50 focus:ring-1 focus:ring-neon/20 transition-all text-sm"
                            />
                            <button
                                onClick={handleSendChat}
                                disabled={isLoading || !chatInput.trim()}
                                className="px-5 py-3.5 rounded-xl bg-neon/20 border border-neon/40 text-neon hover:bg-neon/30 transition-all disabled:opacity-30"
                            >
                                ↑
                            </button>
                        </div>

                        {/* Enter Starfield button */}
                        {chatCount >= 3 && (
                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={handleFinish}
                                className="w-full mt-4 py-4 rounded-xl bg-gradient-to-r from-neon/20 to-quantum/20 border border-neon/40 text-neon font-display font-bold text-sm hover:shadow-[0_0_25px_rgba(0,240,255,0.3)] transition-all"
                            >
                                进入星图，开始寻找 →
                            </motion.button>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
