import { motion } from "motion/react";
import { useStore } from "../store/useStore";
import { Orb } from "../components/Orb";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { runAgentNegotiation } from "../lib/agentEngine";

export function Starfield() {
  const {
    userAgent,
    matchAgents,
    setAgentState,
    setActiveMatch,
    addNegotiationLog,
    setDatePlan,
    updateMatchScore,
  } = useStore();
  const navigate = useNavigate();
  const [isColliding, setIsColliding] = useState(false);

  const handleDragEnd = (id: string, x: number, y: number) => {
    // Logic to update position if needed
  };

  const handleCollision = async (targetId: string) => {
    if (isColliding) return;
    setIsColliding(true);
    setAgentState("user", "Negotiating");
    setAgentState(targetId, "Negotiating");
    setActiveMatch(targetId);

    const targetAgent = matchAgents.find((agent) => agent.id === targetId);
    if (!targetAgent) {
      navigate("/resonance");
      return;
    }

    try {
      const result = await runAgentNegotiation(userAgent, targetAgent);
      updateMatchScore(targetId, result.compatibilityScore);
      result.logs.forEach(addNegotiationLog);
      setDatePlan(result.datePlan);
      setAgentState("user", result.datePlan ? "Confirmed" : "Idle");
      setAgentState(targetId, result.datePlan ? "Confirmed" : "Reflecting");
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
      setAgentState("user", "Idle");
      setAgentState(targetId, "Reflecting");
    }

    // Simulate transition delay
    setTimeout(() => {
      navigate("/resonance");
    }, 700);
  };

  return (
    <div className="relative w-full h-screen bg-void overflow-hidden flex items-center justify-center">
      {/* Background Particles (Mock) */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: Math.random() * 3 + 1 + "px",
              height: Math.random() * 3 + 1 + "px",
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
              opacity: Math.random() * 0.5 + 0.1,
            }}
          />
        ))}
      </div>

      {/* Orbit Zone */}
      <div className="relative w-[800px] h-[600px] flex items-center justify-center">
        {/* User Orb */}
        <Orb
          {...userAgent}
          initialX={0}
          initialY={0}
          isDraggable={true}
          onDragEnd={handleDragEnd}
          onCollision={handleCollision}
          otherOrbs={matchAgents.map((a) => ({ id: a.id, x: a.x, y: a.y }))}
        />

        {/* Match Orbs */}
        {matchAgents.map((agent) => (
          <Orb
            key={agent.id}
            {...agent}
            initialX={agent.x}
            initialY={agent.y}
          />
        ))}
      </div>

      {/* Collision Flash */}
      {isColliding && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 bg-white pointer-events-none z-50"
        />
      )}
    </div>
  );
}
