type Props = {
  onBoost: (v: boolean) => void;
  onBrake: (v: boolean) => void;
};

function PadButton({
  label,
  sub,
  onDown,
  onUp,
  tone,
}: {
  label: string;
  sub: string;
  onDown: () => void;
  onUp: () => void;
  tone: "cyan" | "rose";
}) {
  const color =
    tone === "cyan"
      ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100 shadow-[0_0_24px_-6px_rgba(0,229,255,0.9)]"
      : "border-rose-300/50 bg-rose-500/15 text-rose-100 shadow-[0_0_24px_-6px_rgba(255,77,109,0.9)]";
  return (
    <button
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto flex h-20 w-20 touch-none select-none flex-col items-center justify-center rounded-full border backdrop-blur-sm transition-transform duration-75 active:scale-90 ${color}`}
    >
      <span className="font-display text-xs font-black tracking-[0.15em]">
        {label}
      </span>
      <span className="font-mono text-[8px] opacity-60">{sub}</span>
    </button>
  );
}

export function TouchControls({ onBoost, onBrake }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 flex items-end justify-between px-5">
      <PadButton
        label="BRAKE"
        sub="slow down"
        tone="rose"
        onDown={() => onBrake(true)}
        onUp={() => onBrake(false)}
      />
      <PadButton
        label="NITRO"
        sub="smash cars"
        tone="cyan"
        onDown={() => onBoost(true)}
        onUp={() => onBoost(false)}
      />
    </div>
  );
}
