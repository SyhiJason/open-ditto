import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { useNavigate } from "react-router-dom";

export function Resonance() {
  const { userAgent, matchAgents, activeMatchId, negotiationLogs, datePlan } = useStore();
  const navigate = useNavigate();

  const matchAgent =
    matchAgents.find((a) => a.id === activeMatchId) ?? matchAgents[0];

  const [visibleLogs, setVisibleLogs] = useState(0);
  const [isHumanOverride, setIsHumanOverride] = useState(false);
  const [humanInput, setHumanInput] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Incrementally reveal logs for dramatic effect
  useEffect(() => {
    if (negotiationLogs.length === 0) return;
    setVisibleLogs(0);
    const timers = negotiationLogs.map((_, i) =>
      setTimeout(() => setVisibleLogs(i + 1), i * 1500)
    );
    return () => timers.forEach(clearTimeout);
  }, [negotiationLogs]);

  // Auto-scroll to latest log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLogs]);

  const isConsensus =
    negotiationLogs.length > 0 &&
    visibleLogs >= negotiationLogs.length &&
    negotiationLogs.some((l) => l.type === "Consensus" && l.status === "accepted");

  const isRejected =
    negotiationLogs.length > 0 &&
    visibleLogs >= negotiationLogs.length &&
    negotiationLogs.some((l) => l.type === "Consensus" && l.status === "rejected");

  const handleHumanOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanInput.trim()) return;
    setHumanInput("");
    setIsHumanOverride(false);
  };

  // No active match state
  if (!activeMatchId || negotiationLogs.length === 0) {
    return (
      <div className="min-h-screen bg-void flex flex-col items-center justify-center gap-6 pt-[72px]">
        <div className="text-center">
          <p className="text-4xl mb-4">🌌</p>
          <h2 className="font-display font-bold text-2xl mb-2">尚无协商记录</h2>
          <p className="text-secondary text-sm mb-6">去 Discover 或 Starfield 触发 Agent 匹配</p>
          <button
            onClick={() => navigate("/discover")}
            className="px-6 py-3 rounded-xl bg-neon/20 border border-neon/40 text-neon text-sm font-bold hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all"
          >
            去发现 →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void flex flex-col pt-[72px] overflow-hidden relative">
      {/* ── Top Agent (Match) ────────────────────────────────────────── */}
      <div className="h-[20vh] min-h-[140px] glass-card flex items-center px-8 relative z-20">
        <div className="relative">
          <img
            src={matchAgent.avatarUrl}
            alt={matchAgent.name}
            className="w-14 h-14 rounded-full object-cover border border-white/10"
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-magenta shadow-[0_0_10px_rgba(255,0,110,0.8)]" />
        </div>
        <div className="ml-6 flex flex-col gap-1 max-w-[70%]">
          <span className="font-sans font-semibold text-[11px] text-magenta uppercase tracking-widest">
            {negotiationLogs[Math.max(0, visibleLogs - 1)]?.type ?? "IDLE"}
          </span>
          <p className="font-sans text-base text-white">
            {negotiationLogs[Math.max(0, visibleLogs - 1)]?.perception ?? "..."}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-tertiary mb-1">{matchAgent.profile?.name ?? matchAgent.name}</p>
          <p className="text-xs text-magenta font-mono">{matchAgent.score}% 匹配</p>
        </div>
      </div>

      {/* ── Center Stage ─────────────────────────────────────────────── */}
      <div className="flex-1 relative flex items-center justify-center p-8 z-10">
        <div className="w-full max-w-2xl h-full max-h-[400px] glass-card rounded-3xl flex flex-col items-center justify-center relative overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-neon/5 via-transparent to-magenta/5" />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center gap-4">
            {datePlan ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-2xl">
                  📍
                </div>
                <h3 className="font-display font-bold text-2xl">{datePlan.venue}</h3>
                <p className="font-sans text-sm text-secondary">
                  {datePlan.date} · {datePlan.time}
                </p>
              </>
            ) : isRejected ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-amber/15 backdrop-blur-md flex items-center justify-center border border-amber/40 text-2xl text-amber">
                  !
                </div>
                <h3 className="font-display font-bold text-2xl">未达成一致</h3>
                <p className="font-sans text-sm text-secondary">
                  本轮协商结束，建议调整偏好后再试
                </p>
              </>
            ) : (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12 rounded-full border-2 border-neon/50 border-t-neon"
                />
                <p className="text-secondary text-sm">协商进行中...</p>
              </>
            )}
          </div>

          {/* Consensus Ripple */}
          {isConsensus && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-emerald to-transparent absolute top-1/2 -translate-y-1/2" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-12 h-12 rounded-full bg-emerald flex items-center justify-center z-20 shadow-[0_0_30px_rgba(0,255,136,0.8)]"
              >
                <svg className="w-6 h-6 text-void" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
              {[0, 0.2, 0.4].map((delay) => (
                <motion.div
                  key={delay}
                  initial={{ scale: 1, opacity: 1 }}
                  animate={{ scale: 5, opacity: 0 }}
                  transition={{ duration: 1.5, delay, repeat: Infinity }}
                  className="absolute w-12 h-12 rounded-full border-2 border-emerald"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Incremental Log Strip ─────────────────────────────────────── */}
      <div className="px-8 pb-4 flex flex-col gap-2 max-h-[160px] overflow-y-auto">
        <AnimatePresence>
          {negotiationLogs.slice(0, visibleLogs).map((log) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-start gap-3 text-xs"
            >
              <span
                className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wider flex-shrink-0 ${log.type === "Memory"
                    ? "bg-quantum/20 text-quantum"
                    : log.type === "Decision"
                      ? "bg-neon/20 text-neon"
                      : "bg-emerald/20 text-emerald"
                  }`}
              >
                {log.type}
              </span>
              <span className="text-secondary leading-relaxed">{log.perception}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={logEndRef} />
      </div>

      {/* ── Bottom Agent (User) ───────────────────────────────────────── */}
      <div className="h-[20vh] min-h-[140px] glass-card flex items-center px-8 relative z-20">
        <div className="relative">
          <img
            src={userAgent.avatarUrl}
            alt={userAgent.name}
            className="w-14 h-14 rounded-full object-cover border border-white/10"
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-neon shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
        </div>
        <div className="ml-6 flex flex-col gap-1 max-w-[70%]">
          <span className="font-sans font-semibold text-[11px] text-neon uppercase tracking-widest">
            {isConsensus ? "CONFIRMED" : isRejected ? "REJECTED" : "NEGOTIATING"}
          </span>
          <p className="font-sans text-base text-white">
            {isConsensus
              ? `约会已确认：${datePlan?.venue}`
              : isRejected
                ? "本轮协商未达成一致"
              : "分析偏好 · 检查日历 · 制定方案..."}
          </p>
        </div>
      </div>

      {/* ── Human Override Handle ─────────────────────────────────────── */}
      <motion.div
        className="absolute bottom-0 left-0 w-full z-30 flex flex-col items-center justify-end"
        initial={{ height: "80px" }}
        animate={{ height: isHumanOverride ? "45vh" : "80px" }}
      >
        <div
          className="w-full h-full bg-gradient-to-t from-quantum/20 to-transparent flex flex-col items-center justify-start pt-5 cursor-pointer"
          onClick={() => setIsHumanOverride(!isHumanOverride)}
        >
          <motion.svg
            animate={{ rotate: isHumanOverride ? 180 : 0 }}
            className="w-5 h-5 text-quantum mb-1.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </motion.svg>
          <span className="font-sans font-medium text-xs text-quantum uppercase tracking-widest">
            {isHumanOverride ? "CLOSE OVERRIDE" : "SLIDE TO INTERVENE"}
          </span>

          {isHumanOverride && (
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 w-full max-w-xl px-8"
              onSubmit={handleHumanOverride}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={humanInput}
                onChange={(e) => setHumanInput(e.target.value)}
                placeholder="输入你的指令，覆盖 Agent..."
                className="w-full bg-black/50 border border-quantum/50 rounded-xl px-6 py-4 text-white placeholder-white/30 focus:outline-none focus:border-quantum focus:ring-1 focus:ring-quantum transition-all"
                autoFocus
              />
              <p className="text-xs text-quantum/70 mt-2 text-center">
                手动干预将暂停 Agent 自主权
              </p>
            </motion.form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
