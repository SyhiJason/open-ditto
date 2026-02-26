import { motion } from "motion/react";
import React, { useState } from "react";
import { twMerge } from "tailwind-merge";
import { useStore, NegotiationLog } from "../store/useStore";

export function Chronicle() {
  const {
    negotiationLogs,
    userAgent,
    activeMatchId,
    matchAgents,
    removeMemory,
    adjustMemoryWeight,
  } = useStore();
  const matchAgent = matchAgents.find((a) => a.id === activeMatchId);

  const handleIgnoreMemory = (memoryId?: string) => {
    if (!memoryId) return;
    removeMemory(memoryId);
  };

  const handleBoostMemory = (memoryId?: string) => {
    if (!memoryId) return;
    adjustMemoryWeight(memoryId, 0.1);
  };

  // Fall back to rich mock data if no real logs yet
  const events: NegotiationLog[] =
    negotiationLogs.length > 0
      ? negotiationLogs
      : [
        {
          id: "demo-1",
          type: "Memory",
          timestamp: "示例",
          perception: "等待第一次匹配后生成真实记录。右滑 Discover 页面开始！",
          reasoning: "尚未进行 Agent-to-Agent 协商。",
          action: 'navigate(to="/discover")',
          status: "conditional",
        },
      ];

  return (
    <div className="min-h-screen bg-void pt-[72px] flex">
      {/* Left Sidebar: Agent Profile */}
      <div className="w-[320px] fixed left-0 top-[72px] bottom-0 border-r border-white/10 p-8 flex flex-col items-center">
        <div className="relative mb-6">
          <img
            src={userAgent.avatarUrl}
            alt="Avatar"
            className="w-[100px] h-[100px] rounded-full object-cover border-2 border-neon/50 shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
        </div>

        <h2 className="font-display font-bold text-xl mb-1">
          {userAgent.profile?.name ?? "My Agent"}
        </h2>
        <p className="text-secondary text-xs mb-4">
          {userAgent.profile?.city ?? "Unknown"}
        </p>

        <div className="flex gap-4 mb-6 text-sm text-secondary">
          <div className="text-center">
            <div className="font-bold text-white text-lg">{userAgent.memories.length}</div>
            <div className="text-xs text-tertiary">Memories</div>
          </div>
          <div className="w-px bg-white/10" />
          <div className="text-center">
            <div className="font-bold text-white text-lg">{negotiationLogs.length}</div>
            <div className="text-xs text-tertiary">Events</div>
          </div>
        </div>

        {/* Interest Tags */}
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {(userAgent.profile?.interests ?? []).slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-tertiary"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Match Agent (if active) */}
        {matchAgent && (
          <div className="w-full mt-auto pt-4 border-t border-white/10">
            <p className="text-xs text-tertiary mb-3 uppercase tracking-wider">协商对象</p>
            <div className="flex items-center gap-3">
              <img
                src={matchAgent.avatarUrl}
                alt={matchAgent.name}
                className="w-10 h-10 rounded-full object-cover border border-magenta/40"
              />
              <div>
                <p className="font-medium text-sm">{matchAgent.profile?.name ?? matchAgent.name}</p>
                <p className="text-xs text-magenta">{matchAgent.score}% 匹配</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right Content: Timeline */}
      <div className="ml-[320px] flex-1 p-10 relative">
        {/* Spine */}
        <div className="absolute left-[76px] top-10 bottom-10 w-[2px] bg-white/10" />

        <div className="flex flex-col gap-8 relative z-10">
          {events.map((event) => (
            <TimelineCard
              key={event.id}
              event={event}
              onIgnoreMemory={handleIgnoreMemory}
              onBoostMemory={handleBoostMemory}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineCard({
  event,
  onIgnoreMemory,
  onBoostMemory,
}: {
  key?: React.Key;
  event: NegotiationLog;
  onIgnoreMemory: (memoryId?: string) => void;
  onBoostMemory: (memoryId?: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasMemoryBinding = Boolean(event.memoryId);

  const nodeColors = {
    Memory: "bg-quantum shadow-[0_0_10px_rgba(0,102,255,0.6)]",
    Decision: "bg-neon shadow-[0_0_10px_rgba(0,240,255,0.6)] rotate-45",
    Consensus: "bg-emerald shadow-[0_0_15px_rgba(0,255,136,0.8)]",
  };

  const typeBadge = {
    Memory: "bg-quantum/20 text-quantum",
    Decision: "bg-neon/20 text-neon",
    Consensus: "bg-emerald/20 text-emerald",
  };

  const statusDot = {
    accepted: "bg-emerald",
    conditional: "bg-amber",
    rejected: "bg-magenta",
  };

  return (
    <div className="flex gap-6 items-start">
      {/* Node */}
      <div className="relative mt-4 flex-shrink-0">
        <div className={twMerge("w-3 h-3 rounded-full", nodeColors[event.type])} />
      </div>

      {/* Card */}
      <motion.div
        layout
        className="glass-card rounded-2xl w-full max-w-[560px] overflow-hidden cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="p-5 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="font-sans font-medium text-xs text-tertiary uppercase tracking-wider">
              {event.timestamp}
            </span>
            <div className="flex items-center gap-2">
              <div className={twMerge("w-1.5 h-1.5 rounded-full", statusDot[event.status])} />
              <span className={twMerge("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider", typeBadge[event.type])}>
                {event.type}
              </span>
            </div>
          </div>

          <p className="font-sans text-sm text-white leading-relaxed">{event.perception}</p>

          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex flex-col gap-3 mt-2"
            >
              <div className="pl-3 border-l-2 border-white/10 text-xs text-secondary font-sans">
                <span className="text-white/40 block mb-1">Reasoning:</span>
                {event.reasoning}
              </div>

              <div className="bg-black/40 border border-neon/30 border-l-[3px] border-l-neon p-3 rounded text-xs font-mono text-neon">
                {event.action}
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onIgnoreMemory(event.memoryId);
                  }}
                  disabled={!hasMemoryBinding}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  忽略此记忆
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBoostMemory(event.memoryId);
                  }}
                  disabled={!hasMemoryBinding}
                  className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  强化此偏好
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
