export type ScoreEntry = {
  name: string;
  score: number;
  distance: number;
  bestCombo: number;
  date: number;
};

const KEY = "neondrift.highscores.v1";
const NAME_KEY = "neondrift.lastname";
const MUTE_KEY = "neondrift.muted";
const MAX = 8;

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => typeof e?.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): ScoreEntry[] {
  const list = [...loadScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}

export function writeScores(list: ScoreEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const list = loadScores();
  return list.length < MAX || score > list[list.length - 1].score;
}

export function clearScores() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getLastName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
}
export function setLastName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* ignore */
  }
}

const CAR_KEY = "neondrift.car";
export function getCar(): string {
  try {
    return localStorage.getItem(CAR_KEY) || "vector";
  } catch {
    return "vector";
  }
}
export function setCar(id: string) {
  try {
    localStorage.setItem(CAR_KEY, id);
  } catch {
    /* storage blocked (private mode / sandboxed iframe) — non-fatal */
  }
}

export function getMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* ignore */
  }
}
