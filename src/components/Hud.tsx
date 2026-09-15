import { forwardRef, useImperativeHandle, useRef } from "react";
import type { HudData } from "../game/engine";

export type HudHandle = { update: (d: HudData) => void };

export const Hud = forwardRef<HudHandle, { visible: boolean }>(
  function Hud({ visible }, ref) {
    const score = useRef<HTMLDivElement>(null);
    const dist = useRef<HTMLDivElement>(null);
    const speed = useRef<HTMLDivElement>(null);
    const level = useRef<HTMLDivElement>(null);
    const nitroBar = useRef<HTMLDivElement>(null);
    const nitroWrap = useRef<HTMLDivElement>(null);
    const comboWrap = useRef<HTMLDivElement>(null);
    const comboVal = useRef<HTMLDivElement>(null);
    const comboBar = useRef<HTMLDivElement>(null);
    const needle = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      update(d) {
        if (score.current)
          score.current.textContent = d.score.toLocaleString("en-US");
        if (dist.current) dist.current.textContent = `${d.distance} m`;
        if (speed.current) speed.current.textContent = String(d.speed);
        if (level.current) level.current.textContent = `LVL ${d.level}`;
        if (needle.current)
          needle.current.style.transform = `rotate(${
            -120 + Math.min(d.speed / 420, 1) * 240
          }deg)`;
        if (nitroBar.current) {
          nitroBar.current.style.width = `${d.nitro}%`;
          nitroBar.current.style.background = d.boosting
            ? "linear-gradient(90deg,#fff,#ffd166,#ff8a3d)"
            : "linear-gradient(90deg,#00e5ff,#7af7ff,#ff2d95)";
        }
        if (nitroWrap.current)
          nitroWrap.current.style.opacity = d.nitro > 1 ? "1" : "0.45";
        if (comboWrap.current) {
          const on = d.combo > 0;
          comboWrap.current.style.opacity = on ? "1" : "0";
          comboWrap.current.style.transform = on
            ? `scale(${1 + Math.min(d.combo, 12) * 0.022})`
            : "scale(0.85)";
        }
        if (comboVal.current)
          comboVal.current.textContent = `x${d.multiplier.toFixed(2)}`;
        if (comboBar.current)
          comboBar.current.style.width = `${d.comboFrac * 100}%`;
      },
    }));

    return (
      <div
        className="pointer-events-none absolute inset-0 select-none transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {/* top bar */}
        <div className="flex items-start justify-between p-3 sm:p-5">
          <div>
            <div className="font-display text-[10px] tracking-[0.35em] text-cyan-300/70">
              SCORE
            </div>
            <div
              ref={score}
              className="font-display text-3xl font-black leading-none text-white drop-shadow-[0_0_14px_rgba(0,229,255,0.8)] sm:text-5xl"
            >
              0
            </div>
            <div
              ref={dist}
              className="mt-1 font-mono text-[11px] tracking-widest text-fuchsia-300/80 sm:text-sm"
            >
              0 m
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              ref={level}
              className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-3 py-1 font-display text-[10px] tracking-[0.2em] text-fuchsia-200 sm:text-xs"
            >
              LVL 1
            </div>
            <div className="relative h-16 w-16 sm:h-20 sm:w-20">
              <div className="absolute inset-0 rounded-full border border-cyan-400/25 bg-black/40 backdrop-blur-sm" />
              <div className="absolute inset-[6px] rounded-full border border-cyan-400/10" />
              <div
                ref={needle}
                className="absolute left-1/2 top-1/2 h-[34%] w-[2px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-gradient-to-t from-fuchsia-500 to-cyan-200 shadow-[0_0_8px_rgba(0,229,255,0.9)] transition-transform duration-100 ease-out sm:h-[36%]"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
                <div
                  ref={speed}
                  className="font-display text-base font-black leading-none text-cyan-100 sm:text-xl"
                >
                  0
                </div>
                <div className="font-mono text-[7px] tracking-widest text-cyan-300/60 sm:text-[9px]">
                  KM/H
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* combo */}
        <div
          ref={comboWrap}
          className="absolute left-1/2 top-[14%] -translate-x-1/2 text-center opacity-0 transition-all duration-150"
        >
          <div
            ref={comboVal}
            className="font-display text-2xl font-black text-fuchsia-300 drop-shadow-[0_0_16px_rgba(255,45,149,0.9)] sm:text-4xl"
          >
            x1.00
          </div>
          <div className="mx-auto mt-1 h-[3px] w-20 overflow-hidden rounded-full bg-white/15 sm:w-28">
            <div
              ref={comboBar}
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300"
              style={{ width: "0%" }}
            />
          </div>
          <div className="mt-1 font-display text-[9px] tracking-[0.3em] text-white/50">
            COMBO
          </div>
        </div>

        {/* nitro */}
        <div
          ref={nitroWrap}
          className="absolute bottom-3 left-1/2 w-[62%] max-w-sm -translate-x-1/2 sm:bottom-5"
        >
          <div className="mb-1 flex items-center justify-between font-display text-[9px] tracking-[0.3em] text-cyan-300/70">
            <span>NITRO</span>
            <span className="text-white/40">SPACE / HOLD</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-cyan-400/30 bg-black/50 p-[2px] backdrop-blur-sm">
            <div
              ref={nitroBar}
              className="h-full rounded-full transition-[width] duration-75"
              style={{
                width: "35%",
                background: "linear-gradient(90deg,#00e5ff,#7af7ff,#ff2d95)",
              }}
            />
          </div>
        </div>
      </div>
    );
  },
);
