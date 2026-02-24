import {
  motion,
  useAnimation,
  useMotionValue,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AgentState } from "../store/useStore";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

interface OrbProps {
  key?: string;
  id: string;
  name: string;
  state: AgentState;
  score: number;
  avatarUrl: string;
  initialX: number;
  initialY: number;
  isDraggable?: boolean;
  onDragEnd?: (id: string, x: number, y: number) => void;
  onCollision?: (id: string) => void;
  otherOrbs?: { id: string; x: number; y: number }[];
}

const COLLISION_THRESHOLD = 100; // Distance to trigger collision

export function Orb({
  id,
  name,
  state,
  score,
  avatarUrl,
  initialX,
  initialY,
  isDraggable = false,
  onDragEnd,
  onCollision,
  otherOrbs = [],
}: OrbProps) {
  const [isHovered, setIsHovered] = useState(false);
  const controls = useAnimation();
  const orbRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(initialX);
  const y = useMotionValue(initialY);

  // State colors
  const stateColors = {
    Idle: "bg-amber shadow-[0_0_30px_rgba(255,184,0,0.4)]",
    Reflecting: "bg-neon shadow-[0_0_40px_rgba(0,240,255,0.6)]",
    Negotiating: "bg-magenta shadow-[0_0_40px_rgba(255,0,110,0.6)]",
    Confirmed: "bg-emerald shadow-[0_0_40px_rgba(0,255,136,0.6)]",
  };

  const ringColors = {
    Idle: "border-amber/30",
    Reflecting: "border-neon/30",
    Negotiating: "border-magenta/30",
    Confirmed: "border-emerald/30",
  };

  const textColors = {
    Idle: "text-amber",
    Reflecting: "text-neon",
    Negotiating: "text-magenta",
    Confirmed: "text-emerald",
  };

  useEffect(() => {
    controls.start({ x: initialX, y: initialY });
  }, [initialX, initialY, controls]);

  const handleDragEnd = (event: any, info: any) => {
    const newX = initialX + info.offset.x;
    const newY = initialY + info.offset.y;

    if (onDragEnd) {
      onDragEnd(id, newX, newY);
    }

    // Check collision
    if (onCollision && otherOrbs) {
      for (const other of otherOrbs) {
        const dx = newX - other.x;
        const dy = newY - other.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < COLLISION_THRESHOLD) {
          onCollision(other.id);
          return; // Trigger only one collision
        }
      }
    }

    // Snap back if no collision
    controls.start({
      x: initialX,
      y: initialY,
      transition: { type: "spring", stiffness: 300, damping: 20 },
    });
  };

  return (
    <motion.div
      ref={orbRef}
      className="absolute z-10"
      initial={{ x: initialX, y: initialY }}
      animate={controls}
      drag={isDraggable}
      dragConstraints={{ left: -400, right: 400, top: -300, bottom: 300 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      style={{ x, y }}
      layoutId={`orb-${id}`}
    >
      <div className="relative flex items-center justify-center w-[120px] h-[120px]">
        {/* Pulse Ring */}
        {state === "Reflecting" && (
          <motion.div
            className={twMerge(
              "absolute w-[160px] h-[160px] rounded-full border-2",
              ringColors[state],
            )}
            animate={{ scale: [1, 1.4], opacity: [1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}

        {/* Orb Body */}
        <motion.div
          className={twMerge(
            "w-full h-full rounded-full orb-reflection cursor-grab active:cursor-grabbing",
            stateColors[state],
          )}
          style={{
            background:
              state === "Idle"
                ? "radial-gradient(circle at 30% 30%, #FFB800, #B38100)"
                : state === "Reflecting"
                  ? "radial-gradient(circle at 30% 30%, #00F0FF, #0066FF)"
                  : state === "Negotiating"
                    ? "radial-gradient(circle at 30% 30%, #FF006E, #B3004D)"
                    : "radial-gradient(circle at 30% 30%, #00FF88, #00B35F)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        />

        {/* Hover Info Card */}
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-[140px] whitespace-nowrap glass-card rounded-2xl px-5 py-4 flex items-center gap-3 pointer-events-none"
          >
            <img
              src={avatarUrl}
              alt={name}
              className="w-8 h-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <span className="font-display font-bold text-lg leading-tight">
                {name}
              </span>
              <span
                className={twMerge(
                  "font-sans font-medium text-xs uppercase tracking-wider",
                  textColors[state],
                )}
              >
                {state}
              </span>
            </div>
            {id !== "user" && (
              <div className="ml-2 px-3 py-1 rounded-full bg-neon/20 text-neon font-mono text-xs">
                {score}% MATCH
              </div>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
