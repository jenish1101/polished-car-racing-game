import { CARS, type CarSpec } from "../game/cars";

function Bars({ n, color }: { n: number; color: string }) {
  return (
    <div className="flex gap-[2px]">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className="h-1.5 w-2 rounded-[1px] transition-colors"
          style={{ background: i <= n ? color : "rgba(255,255,255,0.13)" }}
        />
      ))}
    </div>
  );
}

function CarGlyph({ spec }: { spec: CarSpec }) {
  return (
    <svg viewBox="0 0 40 74" className="h-14 w-8 drop-shadow-lg">
      <defs>
        <linearGradient id={`g-${spec.id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={spec.dark} />
          <stop offset="38%" stopColor={spec.body} />
          <stop offset="76%" stopColor={spec.body} />
          <stop offset="100%" stopColor={spec.dark} />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="36"
        height="70"
        rx="9"
        fill={`url(#g-${spec.id})`}
      />
      <rect x="7" y="27" width="26" height="24" rx="5" fill="rgba(8,10,26,.85)" />
      <rect x="8" y="14" width="24" height="12" rx="4" fill="rgba(150,245,255,.6)" />
      <rect x="18" y="4" width="4" height="66" fill="rgba(255,255,255,.16)" />
      <rect x="0" y="56" width="40" height="7" rx="3" fill={spec.dark} />
      <rect x="4" y="64" width="10" height="3" rx="1.5" fill="#ff3b5c" />
      <rect x="26" y="64" width="10" height="3" rx="1.5" fill="#ff3b5c" />
    </svg>
  );
}

export function CarPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="w-full">
      <div className="mb-2 font-display text-[9px] tracking-[0.3em] text-white/40">
        SELECT CHASSIS
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CARS.map((c) => {
          const active = c.id === value;
          return (
            <button
              key={c.id}
              onClick={() => onChange(c.id)}
              className={`group relative flex flex-col items-center gap-2 rounded-xl border p-2.5 transition-all duration-150 active:scale-95 ${
                active
                  ? "border-white/40 bg-white/[0.08]"
                  : "border-white/10 bg-black/30 hover:border-white/25"
              }`}
              style={
                active
                  ? { boxShadow: `0 0 26px -6px rgba(${c.glow},0.95)` }
                  : undefined
              }
            >
              <div
                className="pointer-events-none absolute inset-x-4 -bottom-1 h-6 rounded-full blur-lg transition-opacity"
                style={{
                  background: `rgba(${c.glow},0.55)`,
                  opacity: active ? 0.7 : 0,
                }}
              />
              <CarGlyph spec={c} />
              <div
                className="font-display text-[10px] font-black tracking-[0.15em]"
                style={{ color: active ? c.body : "rgba(255,255,255,0.55)" }}
              >
                {c.name}
              </div>
              <div className="flex w-full flex-col gap-[3px]">
                <Bars n={c.bars.spd} color={c.body} />
                <Bars n={c.bars.grip} color={c.body} />
                <Bars n={c.bars.nos} color={c.body} />
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-white/35">
        <span>SPD · GRIP · NOS</span>
        <span className="text-white/55">
          {CARS.find((c) => c.id === value)?.tag}
        </span>
      </div>
    </div>
  );
}
