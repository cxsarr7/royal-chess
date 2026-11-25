import { Chess, type Move, type Square } from "chess.js";
import { BOT_LEVELS, botById, styleById, type StyleId } from "../../shared/bots.ts";
import { searchFen, type PvLine } from "./stockfish.ts";

export { BOT_LEVELS, botById, styleById };
export type { BotId, StyleId } from "../../shared/bots.ts";

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 } as const;

const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5,
  5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15,
  20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10,
  5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10,
  -10, -10, -10, -10, -10, -20,
];
const ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0,
  0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
];
const QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0,
  -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5,
  -10, -10, -20,
];
const KING = [
  20, 30, 10, 0, 0, 10, 30, 20, 20, 20, 0, 0, 0, 0, 20, 20, -10, -20, -20, -20, -20, -20, -20, -10, -20, -30, -30, -40,
  -40, -30, -30, -20, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
  -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
];

const TABLES = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

function squareIndex(rankIndexFromTop: number, file: number): number {
  return (7 - rankIndexFromTop) * 8 + file;
}

export function evaluateWhite(chess: Chess, style: StyleId = "equilibrado"): number {
  if (chess.isCheckmate()) return chess.turn() === "w" ? -20000 : 20000;
  if (chess.isDraw()) return 0;
  const board = chess.board();
  let score = 0;
  let material = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]![file];
      if (!piece || piece.type === "k") continue;
      material += VALUE[piece.type];
    }
  }
  const endgame = material < 2200;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank]![file];
      if (!piece) continue;
      const sq = squareIndex(rank, file);
      const table = TABLES[piece.type];
      const pst = piece.color === "w" ? table[sq]! : table[sq ^ 56]!;
      const materialValue = piece.type === "k" ? 0 : VALUE[piece.type];
      const sign = piece.color === "w" ? 1 : -1;
      let extra = pst;
      if (style === "agressivo" && piece.type !== "k") {
        const advance = piece.color === "w" ? Math.floor(sq / 8) : 7 - Math.floor(sq / 8);
        extra += advance * (piece.type === "q" || piece.type === "n" ? 4 : 2);
      }
      if (style === "tatico" && piece.type !== "p" && piece.type !== "k") extra += 4;
      if (style === "posicional") extra = Math.round(extra * 1.35);
      if (style === "solido" && piece.type === "k") extra += endgame ? 0 : pst > 0 ? 8 : 12;
      score += sign * (materialValue + extra);
    }
  }
  return score;
}

export type Choice = { from: Square; to: Square; promotion?: "q" | "r" | "b" | "n"; san: string };

function ordered(chess: Chess): Move[] {
  return chess.moves({ verbose: true }).sort((a, b) => {
    const as = (a.captured ? VALUE[a.captured] - VALUE[a.piece] / 10 : 0) + (a.promotion ? 800 : 0);
    const bs = (b.captured ? VALUE[b.captured] - VALUE[b.piece] / 10 : 0) + (b.promotion ? 800 : 0);
    return bs - as;
  });
}

function play(chess: Chess, move: Move): void {
  chess.move({ from: move.from, to: move.to, promotion: move.promotion });
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  style: StyleId,
  deadline: number,
  state: { nodes: number; stop: boolean },
  extension: number,
): number {
  state.nodes += 1;
  if (state.nodes > 70000 || Date.now() > deadline) {
    state.stop = true;
    return (chess.turn() === "w" ? 1 : -1) * evaluateWhite(chess, style);
  }
  if (depth <= 0) {
    if (extension < 1 && chess.inCheck()) {
      return negamax(chess, 1, alpha, beta, style, deadline, state, extension + 1);
    }
    return (chess.turn() === "w" ? 1 : -1) * evaluateWhite(chess, style);
  }
  const moves = ordered(chess);
  if (moves.length === 0) return chess.inCheck() ? -30000 - depth : 0;
  if (chess.isDraw()) return 0;
  let best = -40000;
  for (const move of moves) {
    play(chess, move);
    const score = -negamax(chess, depth - 1, -beta, -alpha, style, deadline, state, extension);
    chess.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function toChoice(fen: string, uci: string): Choice | null {
  const chess = new Chess(fen);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const flag = uci[4];
  const promotion = flag === "q" || flag === "r" || flag === "b" || flag === "n" ? flag : undefined;
  try {
    const played = chess.move({ from, to, promotion });
    return { from: played.from, to: played.to, promotion, san: played.san };
  } catch {
    return null;
  }
}

function tilt(fen: string): number {
  let hash = 0;
  for (let index = 0; index < fen.length; index += 1) hash = (hash * 33 + fen.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000;
}

function styleBonus(san: string, style: StyleId): number {
  if (style === "agressivo" && (san.includes("+") || san.includes("x"))) return 18;
  if (style === "tatico" && san.includes("x")) return 18;
  if (style === "solido" && san.startsWith("O-O")) return 24;
  if (style === "posicional" && !san.includes("x")) return 8;
  return 0;
}

function pickLine(fen: string, lines: PvLine[], levelId: string, style: StyleId): PvLine {
  const level = botById(levelId) ?? BOT_LEVELS[0];
  const orderedLines = [...lines].sort((a, b) => b.score - a.score);
  const best = orderedLines[0]!;
  if (best.mate !== null && best.mate > 0 && best.mate <= 2) return best;
  const room = orderedLines.filter((line) => best.score - line.score <= level.mistakeWindow);
  if (level.mistakeRate > 0 && room.length > 1 && tilt(fen) < level.mistakeRate) {
    const target = level.mistakeWindow * 0.55;
    return room.slice(1).sort((a, b) => Math.abs(best.score - a.score - target) - Math.abs(best.score - b.score - target))[0] ?? best;
  }
  const close = orderedLines.filter((line) => best.score - line.score <= 30);
  return close.sort((a, b) => {
    const aSan = toChoice(fen, a.uci)?.san ?? "";
    const bSan = toChoice(fen, b.uci)?.san ?? "";
    return b.score + styleBonus(bSan, style) - (a.score + styleBonus(aSan, style));
  })[0] ?? best;
}

function chooseMoveLocal(fen: string, levelId: string, style: StyleId): Choice | null {
  const level = botById(levelId) ?? BOT_LEVELS[0];
  const chess = new Chess(fen);
  const rootMoves = ordered(chess);
  if (rootMoves.length === 0) return null;
  const depth = Math.min(4, Math.max(1, level.depth));
  const deadline = Date.now() + 700;
  const state = { nodes: 0, stop: false };
  let bestMove = rootMoves[0]!;
  let bestScore = -40000;
  for (const move of rootMoves) {
    play(chess, move);
    const score = -negamax(chess, depth - 1, -40000, 40000, style, deadline, state, 0);
    chess.undo();
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (state.stop) break;
  }
  const promotion = bestMove.promotion === "q" || bestMove.promotion === "r" || bestMove.promotion === "b" || bestMove.promotion === "n" ? bestMove.promotion : undefined;
  return { from: bestMove.from, to: bestMove.to, promotion, san: bestMove.san };
}

export async function chooseMove(fen: string, levelId: string, styleId: string): Promise<Choice | null> {
  const level = botById(levelId) ?? BOT_LEVELS[0];
  const style = styleById(styleId);
  const chess = new Chess(fen);
  if (chess.moves().length === 0) return null;
  try {
    const lines = await searchFen(fen, {
      depth: level.depth,
      movetime: level.movetime,
      multipv: level.multipv,
      limitElo: level.limitElo,
    });
    const legal = lines.map((line) => ({ line, choice: toChoice(fen, line.uci) })).filter((item) => item.choice);
    if (!legal.length) return chooseMoveLocal(fen, level.id, style);
    const picked = pickLine(fen, legal.map((item) => item.line), level.id, style);
    return toChoice(fen, picked.uci) ?? legal[0]!.choice;
  } catch (error) {
    console.error(error);
    return chooseMoveLocal(fen, level.id, style);
  }
}

export function inspectPosition(fen: string, depth = 2): {
  whiteCp: number;
  bestSan: string | null;
  moves: { san: string; from: string; to: string; whiteCp: number }[];
} {
  const chess = new Chess(fen);
  const sign = chess.turn() === "w" ? 1 : -1;
  const legal = ordered(chess);
  if (legal.length === 0) {
    const whiteCp = chess.inCheck() ? (chess.turn() === "w" ? -30000 : 30000) : 0;
    return { whiteCp, bestSan: null, moves: [] };
  }
  const deadline = Date.now() + 700;
  const state = { nodes: 0, stop: false };
  const moves = legal.map((move) => {
    play(chess, move);
    const sideScore = depth <= 1 ? (chess.turn() === "w" ? 1 : -1) * evaluateWhite(chess) : -negamax(chess, depth - 1, -40000, 40000, "equilibrado", deadline, state, 0);
    chess.undo();
    const whiteCp = Math.round(sign * sideScore);
    return { san: move.san, from: move.from, to: move.to, whiteCp };
  });
  moves.sort((a, b) => (chess.turn() === "w" ? b.whiteCp - a.whiteCp : a.whiteCp - b.whiteCp));
  return { whiteCp: moves[0]!.whiteCp, bestSan: moves[0]!.san, moves };
}
