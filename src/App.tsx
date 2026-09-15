import { useCallback, useEffect, useRef, useState } from "react";
import { RaceGame, type RunResult } from "./game/engine";
import { audio } from "./game/audio";
import {
  getCar,
  setCar,
  getLastName,
  getMuted,
  loadScores,
  saveScore,
  setLastName,
  setMuted as persistMuted,
  writeScores,
  type ScoreEntry,
} from "./game/storage";
import { Hud, type HudHandle } from "./components/Hud";
import { Key, NeonButton, Panel, ScoreTable } from "./components/ui";
import { TouchControls } from "./components/TouchControls";
import { CarPicker } from "./components/CarPicker";
import { carById, setHaptics } from "./game/cars";

const RANKS: [number, string, string][] = [
  [20000, "S", "#ffd166"],
  [12000, "A", "#8affc1"],
  [6000, "B", "#00e5ff"],
  [2500, "C", "#b58cff"],
  [0, "D", "#8b8b9e"],
];
const rankFor = (s: number) => RANKS.find(([min]) => s >= min)!;

type Screen = "menu" | "playing" | "paused" | "gameover";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<RaceGame | null>(null);
  const hudRef = useRef<HudHandle>(null);

  const [screen, setScreen] = useState<Screen>("menu");
  const [result, setResult] = useState<RunResult | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [entryDate, setEntryDate] = useState<number | null>(null);
  const [name, setName] = useState(getLastName() || "PILOT");
  const [muted, setMutedState] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [hint, setHint] = useState(false);
  const [carId, setCarId] = useState(getCar);
  const carIdRef = useRef(carId);
  carIdRef.current = carId;
  const screenRef = useRef<Screen>("menu");
  screenRef.current = screen;

  /* -------- boot -------- */
  useEffect(() => {
    setScores(loadScores());
    const m = getMuted();
    setMutedState(m);
    audio.setMuted(m);
    setHaptics(!m);
    setIsTouch(
      typeof window !== "undefined" &&
        window.matchMedia("(pointer: coarse)").matches,
    );

    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new RaceGame(canvas);
    gameRef.current = game;

    game.onHud = (d) => hudRef.current?.update(d);
    game.onPauseRequest = () => {
      if (screenRef.current === "playing") {
        game.pause();
        setScreen("paused");
      } else if (screenRef.current === "paused") {
        game.resume();
        setScreen("playing");
      }
    };
    game.onGameOver = (r) => {
      setResult(r);
      setScreen("gameover");
      if (r.score > 0) {
        const entry: ScoreEntry = {
          name: (getLastName() || "PILOT").toUpperCase().slice(0, 10),
          score: r.score,
          distance: r.distance,
          bestCombo: r.bestCombo,
          date: Date.now(),
        };
        setEntryDate(entry.date);
        setScores(saveScore(entry));
      } else {
        setEntryDate(null);
        setScores(loadScores());
      }
    };

    const ro = new ResizeObserver(() => game.resize());
    ro.observe(canvas);
    window.addEventListener("resize", game.resize);
    const onBlur = () => {
      if (screenRef.current === "playing") {
        game.pause();
        setScreen("paused");
      }
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onBlur();
    });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", game.resize);
      window.removeEventListener("blur", onBlur);
      game.destroy();
    };
  }, []);

  /* -------- actions -------- */
  const hintTimer = useRef<number | undefined>(undefined);
  const startGame = useCallback(() => {
    audio.unlock();
    audio.uiClick();
    gameRef.current?.start(carById(carIdRef.current));
    setScreen("playing");
    setHint(true);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(false), 2600);
  }, []);

  const resume = useCallback(() => {
    audio.uiClick();
    gameRef.current?.resume();
    setScreen("playing");
  }, []);

  const toMenu = useCallback(() => {
    audio.uiClick();
    gameRef.current?.toMenu();
    setScreen("menu");
    setScores(loadScores());
  }, []);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      audio.setMuted(next);
      setHaptics(!next);
      persistMuted(next);
      return next;
    });
  }, []);

  /* -------- keyboard shortcuts for screens -------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT") return;
      const k = e.key.toLowerCase();
      if (screenRef.current === "menu" && (k === "enter" || k === " ")) {
        e.preventDefault();
        startGame();
      } else if (screenRef.current === "gameover" && (k === "r" || k === "enter" || k === " ")) {
        e.preventDefault();
        startGame();
      } else if (screenRef.current === "paused" && (k === "r")) {
        e.preventDefault();
        startGame();
      } else if (screenRef.current === "menu" && k === "m") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startGame, toggleMute]);

  const commitName = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9 _-]/g, "").slice(0, 10);
    setName(clean);
    setLastName(clean || "PILOT");
    if (entryDate) {
      const list = loadScores().map((s) =>
        s.date === entryDate ? { ...s, name: clean || "PILOT" } : s,
      );
      writeScores(list);
      setScores(list);
    }
  };

  const best = scores[0]?.score ?? 0;
  const isNewBest =
    result != null && entryDate != null && scores[0]?.date === entryDate;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#07060f] font-body text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* CRT scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-overlay"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0.75) 0px, rgba(0,0,0,0.75) 1px, transparent 1px, transparent 3px)",
        }}
      />

      <Hud ref={hudRef} visible={screen === "playing" || screen === "paused"} />

      {/* top-center utility buttons */}
      {(screen === "playing" || screen === "paused") && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-2">
          <IconBtn
            label={screen === "paused" ? "▶" : "❚❚"}
            onClick={() =>
              screen === "paused"
                ? resume()
                : (gameRef.current?.pause(), setScreen("paused"))
            }
          />
          <IconBtn label={muted ? "🔇" : "🔊"} onClick={toggleMute} />
        </div>
      )}

      {screen === "playing" && (
        <div
          className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/50 px-4 py-2 font-display text-[10px] tracking-[0.25em] text-white/80 backdrop-blur transition-all duration-500"
          style={{
            opacity: hint ? 1 : 0,
            transform: `translateX(-50%) scale(${hint ? 1 : 0.9})`,
          }}
        >
          {isTouch ? "👆 DRAG ANYWHERE TO STEER" : "A / D · ← → TO STEER"}
        </div>
      )}

      {isTouch && screen === "playing" && (
        <TouchControls
          onBoost={(v) => {
            if (gameRef.current) gameRef.current.touchBoost = v;
          }}
          onBrake={(v) => {
            if (gameRef.current) gameRef.current.touchBrake = v;
          }}
        />
      )}

      {/* ---------------- MENU ---------------- */}
      {screen === "menu" && (
        <Overlay>
          <div className="animate-[rise_.5s_ease-out] text-center">
            <h1 className="font-display text-5xl font-black leading-none tracking-tight sm:text-7xl">
              <span className="bg-gradient-to-b from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(0,229,255,0.55)]">
                NEON
              </span>
              <span className="bg-gradient-to-b from-fuchsia-300 to-fuchsia-600 bg-clip-text text-transparent drop-shadow-[0_0_25px_rgba(255,45,149,0.6)]">
                DRIFT
              </span>
            </h1>
            <p className="mt-2 font-display text-[10px] tracking-[0.55em] text-white/45 sm:text-xs">
              ENDLESS HIGHWAY RUNNER
            </p>
          </div>

          <Panel className="mt-6">
            <div className="flex flex-col items-center gap-4">
              <CarPicker
                value={carId}
                onChange={(id) => {
                  setCarId(id);
                  setCar(id);
                  audio.unlock();
                  audio.uiClick();
                }}
              />

              <NeonButton onClick={startGame} className="w-full text-base">
                ▸ Race Now
              </NeonButton>

              <div className="grid w-full grid-cols-2 gap-3 text-[11px] text-white/60">
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="mb-2 font-display text-[9px] tracking-[0.25em] text-cyan-300/80">
                    KEYBOARD
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Key>A</Key>
                      <Key>D</Key>
                      <span className="ml-1">steer</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key>W</Key>
                      <Key>S</Key>
                      <span className="ml-1">gas / brake</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key>SPACE</Key>
                      <span className="ml-1">nitro</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Key>P</Key>
                      <span className="ml-1">pause</span>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="mb-2 font-display text-[9px] tracking-[0.25em] text-fuchsia-300/80">
                    TOUCH
                  </div>
                  <div className="space-y-1.5">
                    <div>👆 drag anywhere to steer</div>
                    <div>🔵 hold NITRO to boost</div>
                    <div>🔴 hold BRAKE to slow</div>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-2">
                <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 text-center text-[11px] leading-relaxed text-cyan-100/80">
                  Skim past traffic for{" "}
                  <b className="text-cyan-300">near-miss combos</b>. Grab cells
                  to fill nitro — boosting lets you{" "}
                  <b className="text-fuchsia-300">smash straight through</b>{" "}
                  cars.
                </div>
                <div className="rounded-lg border border-amber-300/25 bg-amber-300/5 p-2.5 text-center text-[11px] text-amber-100/80">
                  ⚠️ From <b className="text-amber-200">LVL 3</b>, yellow
                  wrong-way racers close in fast — dodging them pays{" "}
                  <b className="text-amber-200">double</b>.
                </div>
              </div>

              <div className="w-full">
                <div className="mb-2 flex items-center justify-between font-display text-[9px] tracking-[0.3em] text-white/40">
                  <span>HIGH SCORES</span>
                  <span>BEST {best.toLocaleString("en-US")}</span>
                </div>
                <ScoreTable scores={scores.slice(0, 5)} />
              </div>

              <button
                onClick={toggleMute}
                className="font-mono text-[10px] tracking-widest text-white/35 transition-colors hover:text-white/70"
              >
                SOUND: {muted ? "OFF" : "ON"} (M)
              </button>
            </div>
          </Panel>
        </Overlay>
      )}

      {/* ---------------- PAUSE ---------------- */}
      {screen === "paused" && (
        <Overlay>
          <Panel className="animate-[rise_.25s_ease-out]">
            <h2 className="text-center font-display text-3xl font-black tracking-[0.3em] text-cyan-200 drop-shadow-[0_0_18px_rgba(0,229,255,0.6)]">
              PAUSED
            </h2>
            <p className="mt-2 text-center font-mono text-[11px] text-white/40">
              take a breath, pilot
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <NeonButton onClick={resume}>Resume</NeonButton>
              <div className="flex gap-2">
                <NeonButton variant="ghost" onClick={startGame} className="flex-1">
                  Restart
                </NeonButton>
                <NeonButton variant="ghost" onClick={toMenu} className="flex-1">
                  Menu
                </NeonButton>
              </div>
            </div>
          </Panel>
        </Overlay>
      )}

      {/* ---------------- GAME OVER ---------------- */}
      {screen === "gameover" && result && (
        <Overlay>
          <Panel className="animate-[rise_.3s_ease-out]">
            <div className="flex items-center justify-center gap-5">
              <div
                className="flex h-20 w-20 shrink-0 animate-[rise_.45s_cubic-bezier(.2,1.4,.4,1)] items-center justify-center rounded-2xl border-2 font-display text-4xl font-black"
                style={{
                  color: rankFor(result.score)[2],
                  borderColor: rankFor(result.score)[2] + "66",
                  background: `radial-gradient(circle at 50% 30%, ${rankFor(result.score)[2]}22, transparent 70%)`,
                  textShadow: `0 0 22px ${rankFor(result.score)[2]}`,
                }}
              >
                {rankFor(result.score)[1]}
              </div>
              <div className="text-left">
                <div className="font-display text-[10px] tracking-[0.5em] text-rose-400/80">
                  WRECKED
                </div>
                <div className="mt-1 font-display text-4xl font-black leading-none text-white drop-shadow-[0_0_24px_rgba(255,45,149,0.7)]">
                  {result.score.toLocaleString("en-US")}
                </div>
                <div className="mt-1 font-mono text-[10px] tracking-widest text-white/35">
                  RANK {rankFor(result.score)[1]} · {carById(carId).name}
                </div>
              </div>
            </div>
            <div className="text-center">
              {isNewBest && (
                <div className="mt-2 inline-block animate-pulse rounded-full bg-gradient-to-r from-amber-300 to-fuchsia-400 px-3 py-1 font-display text-[10px] font-black tracking-[0.2em] text-[#12081f]">
                  ★ NEW PERSONAL BEST
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              <Stat label="DIST" value={`${result.distance}m`} />
              <Stat label="COMBO" value={`x${result.bestCombo}`} />
              <Stat label="NEAR" value={String(result.nearMisses)} />
              <Stat label="SMASH" value={String(result.smashes)} />
            </div>

            {entryDate && (
              <div className="mt-4 flex items-center gap-2">
                <span className="font-display text-[9px] tracking-[0.25em] text-white/40">
                  NAME
                </span>
                <input
                  value={name}
                  onChange={(e) => commitName(e.target.value)}
                  maxLength={10}
                  className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 font-display text-sm tracking-[0.2em] text-cyan-200 outline-none transition-colors focus:border-cyan-300/70"
                />
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 font-display text-[9px] tracking-[0.3em] text-white/40">
                LEADERBOARD
              </div>
              <ScoreTable scores={scores} highlight={entryDate ?? undefined} />
            </div>

            <div className="mt-5 flex gap-2">
              <NeonButton onClick={startGame} className="flex-1">
                Retry (R)
              </NeonButton>
              <NeonButton variant="ghost" onClick={toMenu}>
                Menu
              </NeonButton>
            </div>
          </Panel>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 overflow-y-auto overscroll-contain bg-gradient-to-b from-[#07060f]/70 via-[#0a0618]/80 to-[#07060f]/90 backdrop-blur-[2px]">
      <div className="flex min-h-full flex-col items-center justify-center p-4 py-8">
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] py-2">
      <div className="font-display text-base font-black text-cyan-200">
        {value}
      </div>
      <div className="font-mono text-[8px] tracking-[0.2em] text-white/35">
        {label}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-black/40 text-xs text-white/70 backdrop-blur transition-colors hover:border-cyan-300/60 hover:text-white"
    >
      {label}
    </button>
  );
}
