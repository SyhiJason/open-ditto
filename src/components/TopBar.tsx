import { useStore } from "../store/useStore";
import { NavLink } from "react-router-dom";

export function TopBar() {
  const userAgent = useStore((state) => state.userAgent);

  const navItems = [
    { to: "/", label: "星图", en: "Starfield" },
    { to: "/discover", label: "发现", en: "Discover" },
    { to: "/resonance", label: "协商", en: "Resonance" },
    { to: "/chronicle", label: "记录", en: "Chronicle" },
  ];

  return (
    <div className="fixed top-0 w-full h-[72px] bg-gradient-to-b from-void to-transparent z-50 flex items-center justify-between px-8">
      {/* Logo */}
      <div className="font-display font-bold text-xl text-white tracking-tight flex items-center gap-2">
        <span className="text-neon">◆</span>
        <span>Open Ditto</span>
      </div>

      {/* Nav */}
      <div className="flex gap-6">
        {navItems.map(({ to, label, en }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 group transition-all duration-200 ${isActive ? "opacity-100" : "opacity-40 hover:opacity-70"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`font-sans font-medium text-xs uppercase tracking-widest ${isActive ? "text-neon" : "text-white"
                    }`}
                >
                  {en}
                </span>
                <span className="font-sans text-[10px] text-tertiary">{label}</span>
                <div
                  className={`h-px w-full transition-all duration-300 ${isActive ? "bg-neon shadow-[0_0_6px_rgba(0,240,255,0.8)]" : "bg-transparent"
                    }`}
                />
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User Avatar */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-medium text-white/80">{userAgent.profile?.name ?? "My Agent"}</p>
          <p className="text-[10px] text-tertiary">{userAgent.memories.length} memories</p>
        </div>
        <div className="relative">
          <img
            src={userAgent.avatarUrl}
            alt={userAgent.name}
            className="w-10 h-10 rounded-full object-cover border border-white/10"
            referrerPolicy="no-referrer"
          />
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald shadow-[0_0_10px_rgba(0,255,136,0.8)]" />
        </div>
      </div>
    </div>
  );
}
