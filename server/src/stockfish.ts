import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type PvLine = {
  uci: string;
  cp: number;
  mate: number | null;
  score: number;
};

type Waiter = { resolve: (lines: string[]) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };

let child: ChildProcessWithoutNullStreams | null = null;
let buffer = "";
let batch: string[] = [];
let waiter: Waiter | null = null;
let chain: Promise<unknown> = Promise.resolve();
let booted: Promise<void> | null = null;

function enginePath(): string {
  return require("stockfish").findEngine("lite-single") as string;
}

function failWaiter(error: Error) {
  if (!waiter) return;
  clearTimeout(waiter.timer);
  const current = waiter;
  waiter = null;
  batch = [];
  current.reject(error);
}

function onLine(line: string) {
  if (!line) return;
  batch.push(line);
  if (line.startsWith("bestmove") || line === "uciok" || line === "readyok") {
    if (!waiter) {
      batch = [];
      return;
    }
    clearTimeout(waiter.timer);
    const current = waiter;
    const lines = batch;
    waiter = null;
    batch = [];
    current.resolve(lines);
  }
}

function boot(): Promise<void> {
  if (booted) return booted;
  booted = (async () => {
    child = spawn(process.execPath, [enginePath()], { stdio: "pipe" });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let cut = buffer.indexOf("\n");
      while (cut >= 0) {
        const line = buffer.slice(0, cut).replace(/\r$/, "");
        buffer = buffer.slice(cut + 1);
        onLine(line.trim());
        cut = buffer.indexOf("\n");
      }
    });
    child.on("exit", () => {
      child = null;
      booted = null;
      failWaiter(new Error("Stockfish encerrou."));
    });
    const uci = expectMarker("uciok", 20000);
    child.stdin.write("uci\n");
    await uci;
    child.stdin.write("setoption name Hash value 32\n");
    const ready = expectMarker("readyok", 15000);
    child.stdin.write("isready\n");
    await ready;
  })();
  return booted;
}

function expectMarker(marker: "uciok" | "readyok" | "bestmove", ms: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiter = null;
      reject(new Error(`Stockfish não respondeu (${marker}).`));
    }, ms);
    waiter = {
      resolve,
      reject,
      timer,
    };
  });
}

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function parse(lines: string[]): PvLine[] {
  const byIndex = new Map<number, PvLine>();
  let fallbackCp = 0;
  let fallbackMate: number | null = null;
  for (const line of lines) {
    if (!line.startsWith("info ") || !line.includes(" pv ")) continue;
    const multipv = Number(line.match(/ multipv (\d+)/)?.[1] ?? 1);
    const mateText = line.match(/ score mate (-?\d+)/);
    const cpText = line.match(/ score cp (-?\d+)/);
    const pv = line.match(/ pv (\S+)/)?.[1];
    if (!pv) continue;
    const mate = mateText ? Number(mateText[1]) : null;
    const cp = cpText ? Number(cpText[1]) : mate && mate > 0 ? 100000 : mate ? -100000 : 0;
    const score = mate === null ? cp : mate > 0 ? 100000 - mate : -100000 - mate;
    byIndex.set(multipv, { uci: pv, cp, mate, score });
    fallbackCp = cp;
    fallbackMate = mate;
  }
  const best = lines.find((line) => line.startsWith("bestmove "))?.split(/\s+/)[1];
  if (best && best !== "(none)" && byIndex.size === 0) {
    const score = fallbackMate === null ? fallbackCp : fallbackMate > 0 ? 100000 - fallbackMate : -100000 - fallbackMate;
    byIndex.set(1, { uci: best, cp: fallbackCp, mate: fallbackMate, score });
  }
  return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map((entry) => entry[1]);
}

export function searchFen(fen: string, options: { depth: number; movetime: number; multipv: number; limitElo: number | null }): Promise<PvLine[]> {
  return enqueue(async () => {
    await boot();
    if (!child) throw new Error("Stockfish indisponível.");
    const elo = options.limitElo && options.limitElo >= 1320 ? options.limitElo : null;
    child.stdin.write(`setoption name UCI_LimitStrength value ${elo ? "true" : "false"}\n`);
    if (elo) child.stdin.write(`setoption name UCI_Elo value ${elo}\n`);
    child.stdin.write(`setoption name MultiPV value ${Math.max(1, options.multipv)}\n`);
    const ready = expectMarker("readyok", 8000);
    child.stdin.write("isready\n");
    await ready;
    child.stdin.write(`position fen ${fen}\n`);
    const search = expectMarker("bestmove", Math.max(8000, options.movetime + 8000));
    child.stdin.write(`go depth ${options.depth} movetime ${options.movetime}\n`);
    const lines = await search;
    return parse(lines);
  });
}
