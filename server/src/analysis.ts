import { Chess } from "chess.js";
import { httpError } from "./auth.ts";
import { one, run, type GameRow, type UserRow } from "./db.ts";
import { unlock } from "./achievements.ts";
import { movesOf } from "./games.ts";
import { searchFen } from "./stockfish.ts";

export type ClassName =
  | "brilhante"
  | "genial"
  | "melhor"
  | "excelente"
  | "bom"
  | "teoria"
  | "imprecisao"
  | "erro"
  | "grave"
  | "forcado";

const BOOK = [
  "e4 e5 Nf3 Nc6 Bb5",
  "e4 e5 Nf3 Nc6 Bc4",
  "e4 e5 Nf3 Nf6",
  "e4 c5 Nf3 d6 d4",
  "e4 c5 Nf3 Nc6 d4",
  "e4 c5 Nf3 e6 d4",
  "e4 e6 d4 d5",
  "e4 c6 d4 d5",
  "e4 d5 exd5",
  "e4 Nf6 e5 Nd5",
  "d4 d5 c4 e6",
  "d4 d5 c4 c6",
  "d4 Nf6 c4 e6",
  "d4 Nf6 Nf3 g6",
  "d4 f5 c4",
  "Nf3 d5 d4",
  "Nf3 Nf6 c4",
  "c4 e5 Nc3 Nf6",
  "c4 c5 Nf3",
  "c4 Nf6 Nc3",
];

const PIECE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function inBook(history: string[]): boolean {
  const key = history.join(" ");
  return BOOK.some((line) => line === key || line.startsWith(`${key} `));
}

function moverScore(cp: number, mate: number | null): number {
  if (mate === null) return cp;
  return mate > 0 ? 100000 - mate * 10 : -100000 - mate * 10;
}

async function probe(fen: string): Promise<{ uci: string | null; score: number; mate: number | null }> {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const mate = chess.turn() === "w" ? -1 : 1;
    return { uci: null, score: mate > 0 ? 100000 : -100000, mate };
  }
  if (chess.isDraw()) return { uci: null, score: 0, mate: null };
  const lines = await searchFen(fen, { depth: 12, movetime: 220, multipv: 1, limitElo: null });
  const best = lines[0];
  if (!best) return { uci: null, score: 0, mate: null };
  return { uci: best.uci, score: moverScore(best.cp, best.mate), mate: best.mate };
}

function sanOf(fen: string, uci: string | null): string | null {
  if (!uci || uci === "(none)") return null;
  const chess = new Chess(fen);
  const promotion = uci[4];
  try {
    const played = chess.move({
      from: uci.slice(0, 2) as "a1",
      to: uci.slice(2, 4) as "a1",
      promotion: promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n" ? promotion : undefined,
    });
    return played.san;
  } catch {
    return null;
  }
}

function classify(input: {
  drop: number;
  onlyMove: boolean;
  book: boolean;
  best: boolean;
  sacrifice: boolean;
  mateFound: boolean;
  gain: number;
  captured: number;
  ply: number;
}): ClassName {
  if (input.onlyMove) return "forcado";
  if (input.drop >= 300) return "grave";
  if (input.drop >= 140) return "erro";
  if (input.drop >= 60) return "imprecisao";
  if (input.book && input.drop < 40) return "teoria";
  if (input.best && input.sacrifice && input.ply > 10 && input.drop < 25) return "brilhante";
  const tactic = input.gain - input.captured;
  if (input.best && (input.mateFound || tactic >= 180) && input.drop < 20) return "genial";
  if (input.best && input.drop < 12) return "melhor";
  if (input.drop < 25) return "excelente";
  return "bom";
}

export async function analyzeGame(user: UserRow, gameId: number) {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || (game.white_id !== user.id && game.black_id !== user.id)) throw httpError(404, "Partida não encontrada.");
  if (game.status !== "finished") throw httpError(400, "A análise fica disponível quando a partida termina.");
  if (game.analysis) {
    const cached = JSON.parse(game.analysis) as { version?: number };
    if (cached.version === 2) return cached;
  }
  const moves = movesOf(game);
  const chess = new Chess();
  const sans: string[] = [];
  const rows: {
    san: string;
    ply: number;
    color: "w" | "b";
    classification: ClassName;
    drop: number;
    bestSan: string | null;
    whiteCp: number;
  }[] = [];
  let previous = 0;
  for (let index = 0; index < moves.length; index += 1) {
    const fen = chess.fen();
    const turn = chess.turn();
    const legal = chess.moves({ verbose: true });
    const before = await probe(fen);
    const bestSan = sanOf(fen, before.uci);
    const played = moves[index]!;
    const verbose = legal.find((move) => move.from === played.from && move.to === played.to);
    chess.move({ from: played.from as "a1", to: played.to as "a1", promotion: played.promotion });
    sans.push(played.san);
    const movedValue = PIECE[verbose?.piece ?? "p"] ?? 0;
    const captured = verbose?.captured ? PIECE[verbose.captured] ?? 0 : 0;
    const sacrifice = movedValue >= 300 && captured < movedValue && chess.moves({ verbose: true }).some((move) => move.to === played.to && (PIECE[move.piece] ?? 0) < movedValue);
    const after = chess.isGameOver() ? { score: chess.isCheckmate() ? 100000 : 0, mate: chess.isCheckmate() ? 0 : null, uci: null } : await probe(chess.fen());
    const afterForMover = chess.isCheckmate() ? 100000 : -after.score;
    const whiteCp = turn === "w" ? afterForMover : -afterForMover;
    const drop = Math.max(0, Math.round(before.score - afterForMover));
    const gain = afterForMover - (turn === "w" ? previous : -previous);
    rows.push({
      san: played.san,
      ply: index + 1,
      color: turn,
      classification: classify({
        drop,
        onlyMove: legal.length === 1,
        book: inBook(sans),
        best: bestSan === played.san,
        sacrifice,
        mateFound: before.mate !== null && before.mate > 0,
        gain,
        captured,
        ply: index + 1,
      }),
      drop,
      bestSan,
      whiteCp: Math.max(-10000, Math.min(10000, Math.round(whiteCp))),
    });
    previous = whiteCp;
  }
  const summary = {
    version: 2,
    engine: "stockfish",
    moves: rows,
    counts: {
      brilhante: rows.filter((row) => row.classification === "brilhante").length,
      genial: rows.filter((row) => row.classification === "genial").length,
      melhor: rows.filter((row) => row.classification === "melhor" || row.classification === "forcado").length,
      excelente: rows.filter((row) => row.classification === "excelente").length,
      bom: rows.filter((row) => row.classification === "bom").length,
      teoria: rows.filter((row) => row.classification === "teoria").length,
      imprecisao: rows.filter((row) => row.classification === "imprecisao").length,
      erro: rows.filter((row) => row.classification === "erro").length,
      grave: rows.filter((row) => row.classification === "grave").length,
    },
  };
  run("UPDATE games SET analysis = ? WHERE id = ?", JSON.stringify(summary), game.id);
  unlock(user.id, "analyst");
  return summary;
}
