import { audio } from "./audio";
import { buzz, CARS, type CarSpec } from "./cars";

export type Status = "menu" | "playing" | "paused" | "crashing" | "gameover";

export type HudData = {
  score: number;
  distance: number;
  speed: number; // km/h
  combo: number;
  multiplier: number;
  comboFrac: number; // 0..1 remaining time
  nitro: number; // 0..100
  boosting: boolean;
  level: number;
};

export type RunResult = {
  score: number;
  distance: number;
  bestCombo: number;
  smashes: number;
  nearMisses: number;
};

type Car = {
  x: number;
  y: number;
  w: number;
  h: number;
  rel: number; // fraction of player's base speed
  color: string;
  dark: string;
  passed: boolean;
  dead: boolean;
  lane: number;
  sway: number;
  swaySpeed: number;
  oncoming: boolean;
};

type Orb = { x: number; y: number; r: number; t: number; dead: boolean };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 0 | 1 | 2; // 0 spark, 1 smoke, 2 debris
  rot: number;
  spin: number;
  drag: number;
};

type FloatText = {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
};

const LANES = 5;
const CAR_COLORS: [string, string][] = [
  ["#ff4d6d", "#8c1030"],
  ["#ffd166", "#8a6a12"],
  ["#8affc1", "#12694a"],
  ["#b58cff", "#4a2a8f"],
  ["#ff8a3d", "#8a3d10"],
  ["#7ad7ff", "#14607f"],
];

const clamp = (v: number, a: number, b: number) =>
  v < a ? a : v > b ? b : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class RaceGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;

  W = 0;
  H = 0;
  private dpr = 1;
  private u = 1; // scale unit

  status: Status = "menu";

  // road
  private roadW = 0;
  private roadX = 0;
  private laneW = 0;

  // player
  private px = 0;
  private pvx = 0;
  private pw = 0;
  private ph = 0;
  private py = 0;
  private pRot = 0;
  private pDeadRot = 0;

  // motion
  private speed = 0; // units/s (800-height reference)
  private baseSpeed = 560;
  private scroll = 0;
  private distance = 0;
  private score = 0;
  private level = 1;

  // combo
  private combo = 0;
  private comboTimer = 0;
  private bestCombo = 0;
  private nearMisses = 0;
  private smashes = 0;

  // nitro
  private nitro = 35;
  private boosting = false;
  private boostAmt = 0;

  // entities
  private cars: Car[] = [];
  private orbs: Orb[] = [];
  private parts: Particle[] = [];
  private texts: FloatText[] = [];
  private spawnAccum = 0;
  private nextGap = 420;
  private orbAccum = 0;

  // fx
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flash = 0;
  private flashColor = "255,255,255";
  private timeScale = 1;
  private crashTimer = 0;
  private hitCooldown = 0;
  private wallCooldown = 0;

  // loadout + perf
  spec: CarSpec = CARS[0];
  private quality = 1; // 1 = full FX, scales down if frames are slow
  private frameAvg = 16.7;
  private renderErrors = 0;

  // cached paint
  private cacheKey = "";
  private gGround: CanvasGradient | null = null;
  private gRoad: CanvasGradient | null = null;
  private gVignette: CanvasGradient | null = null;
  private redGlow: HTMLCanvasElement | null = null;

  // input
  private keys: Record<string, boolean> = {};
  private pointerActive = false;
  private pointerId = -1;
  private pointerStartX = 0;
  private pointerStartCar = 0;
  private desiredX: number | null = null;
  touchBoost = false;
  touchBrake = false;

  onHud: (d: HudData) => void = () => {};
  onGameOver: (r: RunResult) => void = () => {};
  onPauseRequest: () => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const c = canvas.getContext("2d", { alpha: false });
    if (!c) throw new Error("no 2d context");
    this.ctx = c;
    this.resize();
    this.bind();
    this.resetWorld();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ---------------- setup ---------------- */

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(400, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    const keepRatio = this.roadW ? (this.px - this.roadX) / this.roadW : 0.5;
    this.W = w;
    this.H = h;
    this.u = h / 800;
    this.roadW = Math.min(w * 0.94, h * 0.7);
    this.roadX = (w - this.roadW) / 2;
    this.laneW = this.roadW / LANES;
    this.pw = this.laneW * 0.6;
    this.ph = this.pw * 1.95;
    this.py = h * 0.76;
    this.px = this.roadX + this.roadW * keepRatio;
  };

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    audio.stopEngine();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (
      [
        "arrowleft",
        "arrowright",
        "arrowup",
        "arrowdown",
        " ",
        "a",
        "d",
        "w",
        "s",
      ].includes(k)
    )
      e.preventDefault();
    if ((k === "p" || k === "escape") && !e.repeat) {
      this.onPauseRequest();
      return;
    }
    this.keys[k] = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.status !== "playing") return;
    if (this.pointerActive) return; // ignore extra fingers (e.g. nitro button)
    this.pointerActive = true;
    this.pointerId = e.pointerId;
    this.pointerStartX = e.clientX;
    this.pointerStartCar = this.px;
    this.desiredX = this.px;
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointerActive || e.pointerId !== this.pointerId) return;
    const dx = (e.clientX - this.pointerStartX) * 1.45;
    this.desiredX = clamp(
      this.pointerStartCar + dx,
      this.roadX + this.pw * 0.5,
      this.roadX + this.roadW - this.pw * 0.5,
    );
  };
  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerActive = false;
    this.pointerId = -1;
    this.desiredX = null;
  };

  /* ---------------- lifecycle ---------------- */

  private resetWorld() {
    this.cars = [];
    this.orbs = [];
    this.parts = [];
    this.texts = [];
    this.px = this.roadX + this.roadW / 2;
    this.pvx = 0;
    this.pRot = 0;
    this.pDeadRot = 0;
    this.speed = this.baseSpeed * 0.92;
    this.scroll = 0;
    this.distance = 0;
    this.score = 0;
    this.level = 1;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 0;
    this.nearMisses = 0;
    this.smashes = 0;
    this.nitro = 35;
    this.boosting = false;
    this.boostAmt = 0;
    this.spawnAccum = 0;
    this.nextGap = 520;
    this.orbAccum = 0;
    this.shake = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.crashTimer = 0;
    this.hitCooldown = 0;
    this.wallCooldown = 0;
    this.desiredX = null;
    this.pointerActive = false;
  }

  start(spec?: CarSpec) {
    if (spec) this.spec = spec;
    this.resetWorld();
    this.status = "playing";
    buzz(18);
    audio.startEngine();
    this.flashScreen("120,255,255", 0.35);
    this.addText(this.W / 2, this.H * 0.45, "GO!", "#00e5ff", 46);
    this.burst(this.px, this.py, 22, "#00e5ff", { speed: 420, size: 4 });
    // give the player a little runway of traffic ahead
    for (let i = 0; i < 3; i++) {
      this.spawnRow(-this.H * (0.3 + i * 0.55));
    }
  }

  pause() {
    if (this.status === "playing") {
      this.status = "paused";
      audio.stopEngine();
    }
  }
  resume() {
    if (this.status === "paused") {
      this.status = "playing";
      this.last = performance.now();
      this.acc = 0;
      audio.startEngine();
    }
  }
  toMenu() {
    this.status = "menu";
    audio.stopEngine();
    this.resetWorld();
  }

  /* ---------------- helpers ---------------- */

  private laneCenter(i: number) {
    return this.roadX + this.laneW * (i + 0.5);
  }

  /** main 0..1 ramp for the first few km */
  private get difficulty() {
    return clamp(this.distance / 4200, 0, 1);
  }

  /** combo multiplier, capped so long clean runs stay on a sane curve */
  private get multiplier() {
    return Math.min(1 + this.combo * 0.15, 8);
  }

  /** late-game 0..1 ramp so an endless run eventually becomes lethal */
  private get lateGame() {
    return clamp((this.distance - 4000) / 18000, 0, 1);
  }

  private flashScreen(color: string, amt: number) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amt);
  }

  private addShake(v: number) {
    this.shake = Math.min(this.shake + v, 42);
  }

  private burst(
    x: number,
    y: number,
    n: number,
    color: string,
    opts: Partial<Particle> & { spread?: number; speed?: number } = {},
  ) {
    const spread = opts.spread ?? Math.PI * 2;
    const sp = opts.speed ?? 320;
    const budget = 520 * this.quality;
    n = Math.max(1, Math.round(n * this.quality));
    for (let i = 0; i < n; i++) {
      if (this.parts.length > budget) break;
      const a = rand(-spread / 2, spread / 2) + (opts.rot ?? 0);
      const s = rand(sp * 0.25, sp) * this.u;
      const max = opts.max ?? rand(0.3, 0.8);
      this.parts.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: max,
        max,
        size: (opts.size ?? rand(2, 5)) * this.u,
        color,
        kind: (opts.kind ?? 0) as 0 | 1 | 2,
        rot: Math.random() * 6.28,
        spin: rand(-8, 8),
        drag: opts.drag ?? 2.4,
      });
    }
  }

  private addText(x: number, y: number, text: string, color: string, size = 22) {
    this.texts.push({
      x,
      y,
      vy: -90 * this.u,
      life: 1.05,
      max: 1.05,
      text,
      color,
      size: size * this.u,
    });
  }

  private spawnRow(yOverride?: number) {
    const diff = this.difficulty;
    const late = this.lateGame;
    // late game can wall off 4 of 5 lanes — always leaves exactly one gap
    let maxBlock = Math.min(3, 1 + Math.floor(diff * 2.6));
    if (late > 0.3 && Math.random() < (late - 0.3) * 0.8) maxBlock = 4;
    const count = Math.max(
      1,
      Math.min(maxBlock, 1 + Math.floor(Math.random() * maxBlock)),
    );
    const lanes = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, count);
    const baseY = yOverride ?? -this.ph * 1.2;
    // oncoming "ghost racers" start appearing on level 3+ — never fill every lane
    const canOncoming =
      yOverride === undefined && this.level >= 3 && lanes.length < LANES - 1;
    for (const lane of lanes) {
      const w = this.laneW * rand(0.56, 0.66);
      const h = w * rand(1.85, 2.3);
      const oncoming = canOncoming && Math.random() < 0.1 + this.difficulty * 0.14;
      const [color, dark] = oncoming
        ? (["#ffe066", "#8a6a12"] as [string, string])
        : CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
      this.cars.push({
        x: this.laneCenter(lane),
        y: baseY - Math.random() * this.ph * 0.9,
        w,
        h,
        rel: oncoming ? -rand(0.3, 0.5) : rand(0.34, 0.6) - diff * 0.06,
        color,
        dark,
        passed: false,
        dead: false,
        lane,
        oncoming,
        sway: Math.random() * 6.28,
        swaySpeed: rand(0.4, 1.1),
      });
    }
  }

  private spawnOrb() {
    const occupied = new Set(
      this.cars.filter((c) => c.y < 0 && c.y > -this.H).map((c) => c.lane),
    );
    const free = [0, 1, 2, 3, 4].filter((l) => !occupied.has(l));
    const lane = free.length
      ? free[(Math.random() * free.length) | 0]
      : (Math.random() * LANES) | 0;
    this.orbs.push({
      x: this.laneCenter(lane),
      y: -40 * this.u,
      r: 15 * this.u,
      t: Math.random() * 6.28,
      dead: false,
    });
  }

  /* ---------------- loop ---------------- */

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;

    // adaptive quality: if we're consistently missing 60fps, shed FX
    const ms = Math.min(dt * 1000, 100);
    this.frameAvg += (ms - this.frameAvg) * 0.05;
    if (this.frameAvg > 22 && this.quality > 0.4) this.quality -= 0.004;
    else if (this.frameAvg < 17.5 && this.quality < 1) this.quality += 0.002;

    if (dt > 0.05) dt = 0.05;
    this.acc += dt;
    // fixed-ish stepping for stability, max 3 steps
    const step = 1 / 120;
    let steps = 0;
    while (this.acc >= step && steps < 6) {
      this.update(step);
      this.acc -= step;
      steps++;
    }
    if (steps === 6) this.acc = 0;

    // A thrown frame must never permanently black-screen the canvas.
    try {
      this.render();
    } catch (err) {
      this.renderErrors++;
      if (this.renderErrors === 1) console.error("render error:", err);
      if (this.renderErrors > 20 && this.quality > 0.4) {
        this.quality = 0.4; // shed optional FX and keep the core loop alive
        this.renderErrors = 0;
      }
    }
  };

  private update(rdt: number) {
    const playing = this.status === "playing";
    const crashing = this.status === "crashing";

    // fx timers run on real time
    this.shake = Math.max(0, this.shake - this.shake * 8 * rdt - 6 * rdt);
    this.flash = Math.max(0, this.flash - 2.2 * rdt);

    if (!playing && !crashing) {
      if (this.status === "menu") this.updateAttract(rdt);
      return;
    }

    if (crashing) {
      this.timeScale = lerp(this.timeScale, 0.14, 1 - Math.pow(0.001, rdt));
      this.crashTimer += rdt;
      if (this.crashTimer > 1.15) {
        this.status = "gameover";
        audio.stopEngine();
        this.onGameOver({
          score: Math.floor(this.score),
          distance: Math.floor(this.distance),
          bestCombo: this.bestCombo,
          smashes: this.smashes,
          nearMisses: this.nearMisses,
        });
        return;
      }
    } else {
      this.timeScale = lerp(this.timeScale, 1, 1 - Math.pow(0.001, rdt));
    }

    const dt = rdt * this.timeScale;

    /* ---- input ---- */
    let steer = 0;
    if (playing) {
      if (this.keys["arrowleft"] || this.keys["a"]) steer -= 1;
      if (this.keys["arrowright"] || this.keys["d"]) steer += 1;
    }
    const throttle = playing && (this.keys["arrowup"] || this.keys["w"]);
    const brake =
      playing && (this.keys["arrowdown"] || this.keys["s"] || this.touchBrake);
    const wantBoost =
      playing &&
      (this.keys[" "] || this.keys["shift"] || this.touchBoost) &&
      this.nitro > 0;

    /* ---- boost ---- */
    if (wantBoost && !this.boosting) {
      audio.boost();
      this.addShake(10);
      this.flashScreen("120,255,255", 0.22);
    }
    this.boosting = !!wantBoost;
    if (this.boosting) {
      this.nitro = Math.max(0, this.nitro - (30 / this.spec.nitro) * dt);
      this.boostAmt = lerp(this.boostAmt, 1, 1 - Math.pow(0.002, dt));
    } else {
      this.boostAmt = lerp(this.boostAmt, 0, 1 - Math.pow(0.02, dt));
    }

    /* ---- speed ---- */
    const target =
      (this.baseSpeed + this.difficulty * 620 + this.lateGame * 260) *
      this.spec.speed *
      (1 + this.boostAmt * 0.55) *
      (throttle ? 1.12 : 1) *
      (brake ? 0.62 : 1);
    this.speed = lerp(this.speed, target, 1 - Math.pow(0.08, dt));

    const scrollPx = this.speed * this.u * dt;
    this.scroll += scrollPx;
    if (playing || crashing) {
      this.distance += this.speed * dt * 0.1;
      const mult = this.multiplier;
      if (playing) this.score += this.speed * dt * 0.1 * mult;
    }

    const newLevel = 1 + Math.floor(this.distance / 1000);
    if (newLevel > this.level && playing) {
      this.level = newLevel;
      audio.levelUp();
      this.flashScreen("255,80,200", 0.25);
      this.addText(
        this.W / 2,
        this.H * 0.4,
        `LEVEL ${this.level}`,
        "#ff2d95",
        34,
      );
    }

    /* ---- steering ---- */
    if (playing) {
      const maxV = 900 * this.u * this.spec.grip;
      if (this.desiredX !== null) {
        const want = (this.desiredX - this.px) * 11 * this.spec.grip;
        this.pvx = clamp(want, -maxV, maxV);
      } else if (steer !== 0) {
        this.pvx += steer * 5200 * this.spec.grip * this.u * dt;
        this.pvx = clamp(this.pvx, -maxV, maxV);
      } else {
        this.pvx = lerp(this.pvx, 0, 1 - Math.pow(0.0009, dt));
      }
    } else {
      this.pvx *= 0.98;
    }
    this.px += this.pvx * dt;

    // walls
    const minX = this.roadX + this.pw * 0.5;
    const maxX = this.roadX + this.roadW - this.pw * 0.5;
    if (this.px < minX || this.px > maxX) {
      const wallX = this.px < minX ? minX : maxX;
      const side = this.px < minX ? 1 : -1;
      this.px = wallX;
      if (Math.abs(this.pvx) > 80 * this.u && this.wallCooldown <= 0) {
        this.wallCooldown = 0.12;
        this.addShake(6);
        audio.nearMiss(0);
        this.burst(wallX - side * this.pw * 0.5, this.py, 12, "#ffd166", {
          rot: side > 0 ? -0.5 : Math.PI + 0.5,
          spread: 1.6,
          speed: 420,
          size: 3,
        });
      }
      this.pvx *= -0.25;
      this.speed *= 0.985;
    }
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    this.pRot = lerp(
      this.pRot,
      clamp(this.pvx / (900 * this.u * this.spec.grip), -1, 1) * 0.3,
      1 - Math.pow(0.001, dt),
    );
    if (crashing) this.pDeadRot += dt * 7;

    /* ---- combo decay ---- */
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0;
      }
    }

    /* ---- spawning ---- */
    if (playing) {
      this.spawnAccum += scrollPx;
      if (this.spawnAccum > this.nextGap * this.u) {
        this.spawnAccum = 0;
        this.nextGap =
          lerp(500, 330, this.difficulty) *
          (1 - this.lateGame * 0.26) *
          rand(0.85, 1.25);
        this.spawnRow();
      }
      this.orbAccum += scrollPx;
      if (this.orbAccum > 1500 * this.u) {
        this.orbAccum = 0;
        if (this.nitro < 95) this.spawnOrb();
      }
    }

    /* ---- cars ---- */
    const pHalfW = this.pw * 0.38;
    const pHalfH = this.ph * 0.42;
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.y += (this.speed - this.speed * c.rel) * this.u * dt;
      c.sway += dt * c.swaySpeed;
      const swayX = Math.sin(c.sway) * this.laneW * 0.1;
      const cx = this.laneCenter(c.lane) + swayX;
      c.x = cx;

      if (c.y > this.H + c.h) {
        this.cars.splice(i, 1);
        continue;
      }
      if (c.dead) continue;

      // collision
      if (playing && this.hitCooldown <= 0) {
        const dx = Math.abs(c.x - this.px);
        const dy = Math.abs(c.y - this.py);
        if (dx < pHalfW + c.w * 0.38 && dy < pHalfH + c.h * 0.42) {
          if (this.boostAmt > 0.45) {
            // SMASH!
            c.dead = true;
            this.smashes++;
            this.score += 250;
            this.nitro = Math.min(100, this.nitro + 4);
            this.hitCooldown = 0.05;
            audio.smash();
            buzz([28, 22, 34]);
            this.addShake(22);
            this.flashScreen("255,200,80", 0.4);
            this.burst(c.x, c.y, 26, "#ffd166", { speed: 620, size: 4 });
            this.burst(c.x, c.y, 14, c.color, {
              speed: 420,
              kind: 2,
              size: 7,
              max: 0.9,
            });
            this.addText(c.x, c.y, "SMASH +250", "#ffd166", 22);
            this.cars.splice(i, 1);
            continue;
          } else {
            this.crash(c);
            return;
          }
        }
      }

      // near miss
      if (!c.passed && c.y > this.py + this.ph * 0.45) {
        c.passed = true;
        const dx = Math.abs(c.x - this.px);
        if (playing && dx < this.laneW * 1.15) {
          this.nearMisses++;
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          this.comboTimer = 2.6;
          const risky = c.oncoming || dx < this.laneW * 0.72;
          const pts = Math.round(
            (30 + Math.min(this.combo, 47) * 10) * (risky ? 2 : 1),
          );
          this.score += pts;
          this.nitro = Math.min(100, this.nitro + (risky ? 11 : 7));
          audio.nearMiss(this.combo);
          buzz(risky ? 14 : 8);
          this.addShake(risky ? 5 : 2.5);
          this.burst(c.x, c.y - c.h * 0.3, 8, "#00e5ff", {
            speed: 260,
            size: 2.5,
            max: 0.4,
          });
          this.addText(
            (c.x + this.px) / 2,
            this.py - this.ph * 0.2,
            `${risky ? "CLOSE! " : ""}+${pts}${
              this.combo > 1 ? `  x${this.combo}` : ""
            }`,
            risky ? "#ffd166" : this.combo > 4 ? "#ff2d95" : "#00e5ff",
            risky || this.combo > 4 ? 26 : 20,
          );
        }
      }
    }

    /* ---- orbs ---- */
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.y += this.speed * this.u * dt;
      o.t += dt * 4;
      if (o.y > this.H + 60) {
        this.orbs.splice(i, 1);
        continue;
      }
      const dx = Math.abs(o.x - this.px);
      const dy = Math.abs(o.y - this.py);
      if (playing && dx < o.r + this.pw * 0.4 && dy < o.r + this.ph * 0.4) {
        this.orbs.splice(i, 1);
        this.nitro = Math.min(100, this.nitro + 34);
        this.score += 60;
        audio.pickup();
        this.flashScreen("0,229,255", 0.16);
        this.burst(o.x, o.y, 18, "#00e5ff", { speed: 380, size: 3 });
        this.addText(o.x, o.y, "+NITRO", "#00e5ff", 20);
      }
    }

    /* ---- exhaust / trail particles ---- */
    if (playing || crashing) {
      const rate = this.boosting ? 0.9 : 0.25;
      if (Math.random() < rate) {
        this.burst(
          this.px + rand(-this.pw * 0.3, this.pw * 0.3),
          this.py + this.ph * 0.45,
          1,
          this.boosting ? "#8ff6ff" : "#5a5570",
          {
            speed: this.boosting ? 260 : 90,
            rot: Math.PI / 2,
            spread: 0.8,
            size: this.boosting ? 4 : 6,
            kind: 1,
            max: this.boosting ? 0.35 : 0.6,
            drag: 1.6,
          },
        );
      }
    }

    /* ---- particles ---- */
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += (p.vy + (p.kind === 1 ? 0 : this.speed * this.u * 0.35)) * dt;
      const d = Math.pow(0.02, dt * p.drag * 0.4);
      p.vx *= d;
      p.vy *= d;
      p.rot += p.spin * dt;
    }

    /* ---- texts ---- */
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.1, dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    /* ---- audio + hud ---- */
    audio.updateEngine(
      clamp((this.speed - 400) / 900, 0, 1),
      this.boostAmt > 0.3,
    );

    this.onHud({
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      speed: Math.round(this.speed * 0.36 * (1 + this.boostAmt * 0.1)),
      combo: this.combo,
      multiplier: this.multiplier,
      comboFrac: clamp(this.comboTimer / 2.6, 0, 1),
      nitro: this.nitro,
      boosting: this.boosting,
      level: this.level,
    });
  }

  private crash(c: Car) {
    this.status = "crashing";
    this.crashTimer = 0;
    audio.crash();
    audio.stopEngine();
    buzz([55, 35, 90]);
    this.addShake(40);
    this.flashScreen("255,60,80", 0.7);
    this.burst(this.px, this.py, 46, "#ffd166", { speed: 760, size: 5 });
    this.burst(this.px, this.py, 30, "#ff4d6d", {
      speed: 560,
      kind: 2,
      size: 8,
      max: 1.2,
    });
    this.burst(this.px, this.py, 24, "#6b6580", {
      speed: 240,
      kind: 1,
      size: 14,
      max: 1.4,
    });
    c.dead = true;
    this.pvx = (this.px - c.x) * 2.4;
  }

  /** menu background animation */
  private updateAttract(dt: number) {
    this.speed = lerp(this.speed, 520, 1 - Math.pow(0.2, dt));
    this.scroll += this.speed * this.u * dt;
    this.spawnAccum += this.speed * this.u * dt;
    if (this.spawnAccum > 620 * this.u) {
      this.spawnAccum = 0;
      this.spawnRow();
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      c.y += (this.speed - this.speed * c.rel) * this.u * dt;
      c.sway += dt * c.swaySpeed;
      c.x = this.laneCenter(c.lane) + Math.sin(c.sway) * this.laneW * 0.1;
      if (c.y > this.H + c.h) this.cars.splice(i, 1);
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) this.parts.splice(i, 1);
      else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
  }

  /* ---------------- render ---------------- */

  private ensureCache() {
    const key = `${Math.round(this.W)}x${Math.round(this.H)}`;
    if (key === this.cacheKey) return;
    this.cacheKey = key;
    const ctx = this.ctx;
    const { W, H } = this;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#180a35");
    g.addColorStop(0.45, "#12082a");
    g.addColorStop(1, "#1d0a3c");
    this.gGround = g;

    const r = ctx.createLinearGradient(this.roadX, 0, this.roadX + this.roadW, 0);
    r.addColorStop(0, "#15122a");
    r.addColorStop(0.5, "#1c1836");
    r.addColorStop(1, "#15122a");
    this.gRoad = r;

    const v = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.35,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.72)");
    this.gVignette = v;

    if (!this.redGlow) {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 64;
        const cc = c.getContext("2d");
        if (cc) {
          const rg = cc.createRadialGradient(32, 32, 0, 32, 32, 32);
          rg.addColorStop(0, "rgba(255,60,80,0.55)");
          rg.addColorStop(0.45, "rgba(255,40,70,0.22)");
          rg.addColorStop(1, "rgba(255,40,70,0)");
          cc.fillStyle = rg;
          cc.fillRect(0, 0, 64, 64);
          this.redGlow = c;
        }
      } catch {
        this.redGlow = null;
      }
    }
  }

  private render() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ensureCache();

    // shake
    if (this.shake > 0.2) {
      this.shakeX = rand(-this.shake, this.shake) * this.u;
      this.shakeY = rand(-this.shake, this.shake) * this.u;
    } else {
      this.shakeX = this.shakeY = 0;
    }

    // background
    ctx.fillStyle = "#07060f";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);

    this.drawGround();
    this.drawRoad();
    this.drawOrbs();
    this.drawParticles(1);
    this.drawCars();
    if (this.status !== "gameover") this.drawPlayer();
    this.drawParticles(0);
    this.drawTexts();

    ctx.restore();

    this.drawOverlayFx();
  }

  private drawGround() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.fillStyle = this.gGround ?? "#12082a";
    ctx.fillRect(0, 0, W, H);

    // perspective-ish neon grid on the shoulders
    ctx.save();
    ctx.strokeStyle = "rgba(255,45,149,0.22)";
    ctx.lineWidth = Math.max(1, 1.2 * this.u);
    const spacing = 70 * this.u;
    const off = this.scroll % spacing;
    ctx.beginPath();
    for (let y = -spacing; y < H + spacing; y += spacing) {
      const yy = y + off;
      ctx.moveTo(0, yy);
      ctx.lineTo(this.roadX, yy);
      ctx.moveTo(this.roadX + this.roadW, yy);
      ctx.lineTo(W, yy);
    }
    const vLines = 6;
    for (let i = 0; i <= vLines; i++) {
      const x = (this.roadX / vLines) * i;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      const x2 = this.roadX + this.roadW + (this.roadX / vLines) * i;
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, H);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawRoad() {
    const ctx = this.ctx;
    const { H } = this;
    const rx = this.roadX;
    const rw = this.roadW;

    ctx.fillStyle = this.gRoad ?? "#1c1836";
    ctx.fillRect(rx, 0, rw, H);

    // lane dashes
    const dashH = 58 * this.u;
    const gap = 46 * this.u;
    const period = dashH + gap;
    const off = this.scroll % period;
    ctx.fillStyle = "rgba(200,220,255,0.35)";
    const dw = Math.max(2, 4 * this.u);
    for (let l = 1; l < LANES; l++) {
      const x = rx + this.laneW * l - dw / 2;
      for (let y = -period; y < H + period; y += period) {
        ctx.fillRect(x, y + off, dw, dashH);
      }
    }

    // speed streaks when fast
    const intensity = clamp((this.speed - 620) / 700, 0, 1) + this.boostAmt;
    if (intensity > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(120,240,255,${0.07 + intensity * 0.12})`;
      ctx.lineWidth = 2 * this.u;
      const sp = 90 * this.u;
      const o2 = (this.scroll * 1.7) % sp;
      ctx.beginPath();
      for (let l = 0; l < LANES; l++) {
        const x = rx + this.laneW * (l + 0.5) + Math.sin(l * 3.1) * 8 * this.u;
        for (let y = -sp; y < H + sp; y += sp) {
          const yy = y + o2;
          ctx.moveTo(x, yy);
          ctx.lineTo(x, yy + 40 * this.u * (0.4 + intensity));
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // edge barriers with neon glow
    const barW = 10 * this.u;
    const pulse = 0.65 + Math.sin(performance.now() / 320) * 0.12;
    for (const [x, color] of [
      [rx - barW, "#ff2d95"],
      [rx + rw, "#00e5ff"],
    ] as [number, string][]) {
      ctx.fillStyle = "#0b0820";
      ctx.fillRect(x, 0, barW, H);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse;
      ctx.fillRect(x + barW * 0.25, 0, barW * 0.5, H);
      const gg = ctx.createLinearGradient(x - barW * 2, 0, x + barW * 3, 0);
      gg.addColorStop(0, "rgba(0,0,0,0)");
      gg.addColorStop(0.5, color);
      gg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = gg;
      ctx.fillRect(x - barW * 2, 0, barW * 5, H);
      ctx.restore();
    }

    // scrolling barrier ticks
    const tick = 120 * this.u;
    const to = this.scroll % tick;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let y = -tick; y < H + tick; y += tick) {
      ctx.fillRect(rx - barW, y + to, barW, 16 * this.u);
      ctx.fillRect(rx + rw, y + to, barW, 16 * this.u);
    }
    ctx.restore();
  }

  private roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawCarShape(
    w: number,
    h: number,
    color: string,
    dark: string,
    isPlayer: boolean,
  ) {
    const ctx = this.ctx;
    const r = w * 0.22;
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    this.roundRect(-w / 2 + w * 0.06, -h / 2 + h * 0.05, w, h, r);
    ctx.fill();

    // body
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.35, color);
    g.addColorStop(0.75, color);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    this.roundRect(-w / 2, -h / 2, w, h, r);
    ctx.fill();

    // cabin
    ctx.fillStyle = "rgba(10,12,28,0.85)";
    this.roundRect(-w * 0.34, -h * 0.16, w * 0.68, h * 0.34, w * 0.12);
    ctx.fill();

    // windshield
    ctx.fillStyle = isPlayer
      ? "rgba(140,245,255,0.75)"
      : "rgba(160,190,230,0.45)";
    this.roundRect(-w * 0.3, -h * 0.34, w * 0.6, h * 0.18, w * 0.09);
    ctx.fill();

    // stripes
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(-w * 0.05, -h / 2 + h * 0.04, w * 0.1, h * 0.92);

    // spoiler
    ctx.fillStyle = dark;
    this.roundRect(-w * 0.52, h * 0.34, w * 1.04, h * 0.1, w * 0.05);
    ctx.fill();

    // lights
    if (isPlayer) {
      ctx.fillStyle = "#ff3b5c";
      ctx.fillRect(-w * 0.42, h * 0.38, w * 0.22, h * 0.045);
      ctx.fillRect(w * 0.2, h * 0.38, w * 0.22, h * 0.045);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(255,60,60,0.95)";
      ctx.fillRect(-w * 0.42, h * 0.4, w * 0.24, h * 0.05);
      ctx.fillRect(w * 0.18, h * 0.4, w * 0.24, h * 0.05);
      ctx.restore();
    }
  }

  private drawCars() {
    const ctx = this.ctx;
    for (const c of this.cars) {
      if (c.dead) continue;
      if (c.y < -c.h * 1.5 || c.y > this.H + c.h) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.oncoming) ctx.rotate(Math.PI);
      this.drawCarShape(c.w, c.h, c.color, c.dark, false);
      ctx.restore();

      if (c.oncoming) {
        // blazing white headlights + warning wash so they read instantly
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const hg = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.h * 3);
        hg.addColorStop(0, "rgba(255,240,180,0.34)");
        hg.addColorStop(1, "rgba(255,230,120,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.moveTo(c.x - c.w * 0.4, c.y + c.h * 0.4);
        ctx.lineTo(c.x - c.w * 1.4, c.y + c.h * 3);
        ctx.lineTo(c.x + c.w * 1.4, c.y + c.h * 3);
        ctx.lineTo(c.x + c.w * 0.4, c.y + c.h * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,230,0.95)";
        ctx.fillRect(c.x - c.w * 0.4, c.y + c.h * 0.4, c.w * 0.26, c.h * 0.05);
        ctx.fillRect(c.x + c.w * 0.14, c.y + c.h * 0.4, c.w * 0.26, c.h * 0.05);
        ctx.restore();
        continue;
      }
      // tail light glow pool
      if (this.redGlow) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const gw = c.w * 2.6;
        ctx.drawImage(
          this.redGlow,
          c.x - gw / 2,
          c.y + c.h * 0.5 - gw / 2,
          gw,
          gw,
        );
        ctx.restore();
      }
    }
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const x = this.px;
    const y = this.py;

    // headlight cones
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const cone = ctx.createLinearGradient(0, y - this.ph * 3.2, 0, y);
    cone.addColorStop(0, "rgba(120,230,255,0)");
    cone.addColorStop(1, "rgba(150,240,255,0.16)");
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(x - this.pw * 0.38, y - this.ph * 0.4);
    ctx.lineTo(x - this.pw * 1.5, y - this.ph * 3.2);
    ctx.lineTo(x + this.pw * 1.5, y - this.ph * 3.2);
    ctx.lineTo(x + this.pw * 0.38, y - this.ph * 0.4);
    ctx.closePath();
    ctx.fill();

    // underglow
    const glowR = this.pw * (1.5 + this.boostAmt * 0.8);
    const ug = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    const c1 = this.boostAmt > 0.2 ? "rgba(255,140,60," : "rgba(0,229,255,";
    ug.addColorStop(0, c1 + (0.34 + this.boostAmt * 0.3) + ")");
    ug.addColorStop(1, c1 + "0)");
    ctx.fillStyle = ug;
    ctx.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.pRot * 0.6 + this.pDeadRot);

    // exhaust flame while boosting
    if (this.boostAmt > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fl = this.ph * (0.4 + this.boostAmt * 0.9) * rand(0.8, 1.1);
      const fg = ctx.createLinearGradient(0, this.ph * 0.45, 0, this.ph * 0.45 + fl);
      fg.addColorStop(0, "rgba(255,255,255,0.95)");
      fg.addColorStop(0.35, "rgba(120,240,255,0.7)");
      fg.addColorStop(1, "rgba(255,45,149,0)");
      ctx.fillStyle = fg;
      for (const sx of [-0.26, 0.26]) {
        ctx.beginPath();
        ctx.moveTo(this.pw * sx - this.pw * 0.11, this.ph * 0.45);
        ctx.lineTo(this.pw * sx + this.pw * 0.11, this.ph * 0.45);
        ctx.lineTo(this.pw * sx, this.ph * 0.45 + fl);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    this.drawCarShape(this.pw, this.ph, this.spec.body, this.spec.dark, true);

    // neon outline
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.5 * this.u;
    this.roundRect(-this.pw / 2, -this.ph / 2, this.pw, this.ph, this.pw * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  private drawOrbs() {
    const ctx = this.ctx;
    for (const o of this.orbs) {
      const pulse = 1 + Math.sin(o.t) * 0.14;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 3 * pulse);
      g.addColorStop(0, "rgba(0,229,255,0.9)");
      g.addColorStop(0.3, "rgba(0,229,255,0.35)");
      g.addColorStop(1, "rgba(0,229,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(o.x - o.r * 3, o.y - o.r * 3, o.r * 6, o.r * 6);

      ctx.translate(o.x, o.y);
      ctx.rotate(o.t * 0.6);
      ctx.fillStyle = "#eafdff";
      ctx.beginPath();
      const r = o.r * pulse;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawParticles(kindSmoke: number) {
    const ctx = this.ctx;
    ctx.save();
    if (kindSmoke === 0) ctx.globalCompositeOperation = "lighter";
    for (const p of this.parts) {
      const isSmoke = p.kind === 1;
      if ((kindSmoke === 1) !== isSmoke) continue;
      const t = p.life / p.max;
      ctx.globalAlpha = isSmoke ? t * 0.35 : t;
      ctx.fillStyle = p.color;
      if (p.kind === 2) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (isSmoke) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - t), 0, 6.283);
        ctx.fill();
      } else {
        const s = p.size * (0.4 + t * 0.9);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawTexts() {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const t of this.texts) {
      const k = t.life / t.max;
      ctx.globalAlpha = clamp(k * 1.6, 0, 1);
      const scale = 1 + (1 - k) * 0.25;
      ctx.font = `900 ${t.size * scale}px Orbitron, ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 4 * this.u;
      ctx.strokeStyle = "rgba(4,2,12,0.85)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawOverlayFx() {
    const ctx = this.ctx;
    const { W, H } = this;

    // boost tunnel vignette
    if (this.boostAmt > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(
        W / 2,
        H * 0.6,
        H * 0.15,
        W / 2,
        H * 0.6,
        H * 0.75,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,229,255,${0.22 * this.boostAmt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // vignette
    if (this.gVignette) {
      ctx.fillStyle = this.gVignette;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.flash > 0.001) {
      ctx.fillStyle = `rgba(${this.flashColor},${Math.min(this.flash, 0.85)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
