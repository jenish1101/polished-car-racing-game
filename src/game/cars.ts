export type CarSpec = {
  id: string;
  name: string;
  tag: string;
  body: string;
  dark: string;
  glow: string;
  /** multipliers */
  speed: number; // base velocity
  grip: number; // steering accel / responsiveness
  nitro: number; // nitro efficiency (higher = drains slower)
  /** 1-5 display bars */
  bars: { spd: number; grip: number; nos: number };
};

export const CARS: CarSpec[] = [
  {
    id: "vector",
    name: "VECTOR",
    tag: "balanced all-rounder",
    body: "#20e3ff",
    dark: "#0a5f8f",
    glow: "0,229,255",
    speed: 1,
    grip: 1,
    nitro: 1,
    bars: { spd: 3, grip: 3, nos: 3 },
  },
  {
    id: "havoc",
    name: "HAVOC",
    tag: "brutal top speed, heavy",
    body: "#ff2d95",
    dark: "#7a0c44",
    glow: "255,45,149",
    speed: 1.14,
    grip: 0.78,
    nitro: 1.25,
    bars: { spd: 5, grip: 2, nos: 4 },
  },
  {
    id: "wisp",
    name: "WISP",
    tag: "razor handling, light frame",
    body: "#8affc1",
    dark: "#0e6b46",
    glow: "138,255,193",
    speed: 0.92,
    grip: 1.32,
    nitro: 0.85,
    bars: { spd: 2, grip: 5, nos: 2 },
  },
];

export const carById = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];

/* ---------- haptics ---------- */
let hapticsOn = true;
export function setHaptics(v: boolean) {
  hapticsOn = v;
}
export function buzz(pattern: number | number[]) {
  if (!hapticsOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
