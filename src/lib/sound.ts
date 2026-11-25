let audio: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audio) audio = new AudioContext();
  return audio;
}

function tone(frequency: number, duration: number, type: OscillatorType, gainValue: number, at = 0): void {
  const ctx = context();
  if (!ctx) return;
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(gainValue, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playMoveSound(kind: "move" | "capture" | "check" | "end"): void {
  if (kind === "move") tone(520, 0.07, "triangle", 0.04);
  if (kind === "capture") {
    tone(180, 0.09, "square", 0.03);
    tone(90, 0.12, "sine", 0.04, 0.02);
  }
  if (kind === "check") tone(740, 0.12, "sine", 0.05);
  if (kind === "end") {
    tone(440, 0.12, "triangle", 0.04);
    tone(330, 0.18, "triangle", 0.04, 0.1);
  }
}
