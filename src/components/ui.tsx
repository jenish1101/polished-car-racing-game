import type { ReactNode } from "react";
import type { ScoreEntry } from "../game/storage";

export function NeonButton({
  children,
  onClick,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  const base =
    "group relative isolate inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-display text-sm font-black tracking-[0.2em] uppercase transition-all duration-150 active:scale-[0.96] touch-manipulation";
  const styles =
    variant === "primary"
      ? "bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-[#0a0618] shadow-[0_0_28px_-4px_rgba(0,229,255,0.85)] hover:shadow-[0_0_40px_-2px_rgba(255,45,149,0.9)] hover:brightness-110"
      : "border border-white/20 bg-white/5 text-white/80 backdrop-blur hover:border-cyan-300/60 hover:text-white";
  return (
    <button onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative w-[min(92vw,460px)] overflow-hidden rounded-2xl border border-white/10 bg-[#0c0820]/85 p-6 shadow-[0_0_60px_-10px_rgba(255,45,149,0.45)] backdrop-blur-xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />
      {children}
    </div>
  );
}

export function ScoreTable({
  scores,
  highlight,
}: {
  scores: ScoreEntry[];
  highlight?: number;
}) {
  if (!scores.length)
    return (
      <div className="rounded-lg border border-dashed border-white/15 py-5 text-center font-mono text-xs text-white/35">
        no records yet — set the first one
      </div>
    );
  return (
    <ol className="space-y-1">
      {scores.map((s, i) => {
        const hot = highlight != null && s.date === highlight;
        return (
          <li
            key={s.date + "-" + i}
            className={`flex items-center gap-3 rounded-lg px-3 py-1.5 font-mono text-xs transition-colors sm:text-sm ${
              hot
                ? "bg-gradient-to-r from-cyan-400/25 to-fuchsia-500/20 text-white ring-1 ring-cyan-300/60"
                : i === 0
                  ? "bg-white/[0.06] text-amber-200"
                  : "text-white/65"
            }`}
          >
            <span className="w-5 font-display text-[10px] text-white/35">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 truncate font-display tracking-widest">
              {s.name}
            </span>
            <span className="text-white/35">{s.distance}m</span>
            <span className="w-20 text-right font-display font-bold">
              {s.score.toLocaleString("en-US")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[26px] items-center justify-center rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-display text-[10px] text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset]">
      {children}
    </kbd>
  );
}
