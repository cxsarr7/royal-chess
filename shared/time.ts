export type Pool = "bullet" | "blitz" | "rapid" | "classical";

export type TimeControl = {
  id: string;
  label: string;
  group: Pool | "custom";
  baseMs: number;
  incMs: number;
};

export const TIME_PRESETS: TimeControl[] = [
  { id: "1+0", label: "1+0", group: "bullet", baseMs: 60_000, incMs: 0 },
  { id: "2+1", label: "2+1", group: "bullet", baseMs: 120_000, incMs: 1_000 },
  { id: "3+0", label: "3+0", group: "blitz", baseMs: 180_000, incMs: 0 },
  { id: "3+2", label: "3+2", group: "blitz", baseMs: 180_000, incMs: 2_000 },
  { id: "5+0", label: "5+0", group: "blitz", baseMs: 300_000, incMs: 0 },
  { id: "10+0", label: "10+0", group: "rapid", baseMs: 600_000, incMs: 0 },
  { id: "15+10", label: "15+10", group: "rapid", baseMs: 900_000, incMs: 10_000 },
  { id: "30+0", label: "30+0", group: "classical", baseMs: 1_800_000, incMs: 0 },
  { id: "30+20", label: "30+20", group: "classical", baseMs: 1_800_000, incMs: 20_000 },
];

export const POOL_LABEL: Record<Pool, string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rápidas",
  classical: "Clássicas",
};

/** Estimated duration per side, same idea as base + 40 increments. */
export function classifyPool(baseMs: number, incMs: number): Pool {
  const estimate = baseMs + incMs * 40;
  if (estimate < 3 * 60_000) return "bullet";
  if (estimate < 10 * 60_000) return "blitz";
  if (estimate < 30 * 60_000) return "rapid";
  return "classical";
}

export function formatControl(baseMs: number, incMs: number): string {
  const min = Math.round(baseMs / 60_000);
  const inc = Math.round(incMs / 1000);
  return `${min}+${inc}`;
}

export function clampTime(baseMin: number, incSec: number): { baseMs: number; incMs: number } {
  const base = Math.min(180, Math.max(1, Math.round(baseMin)));
  const inc = Math.min(60, Math.max(0, Math.round(incSec)));
  return { baseMs: base * 60_000, incMs: inc * 1000 };
}
