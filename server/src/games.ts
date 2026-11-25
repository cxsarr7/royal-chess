import { Chess, type Square } from "chess.js";
import crypto from "node:crypto";
import { classifyPool, type Pool } from "../../shared/time.ts";
import { ratingsFor, safeAvatar, toPublic, type PublicUser } from "./auth.ts";
import { db, many, nowIso, one, run, type GameRow, type UserRow } from "./db.ts";
import { applyRating, type PoolName } from "./elo.ts";
import { botById, chooseMove, styleById, type StyleId } from "./engine.ts";

export type StoredMove = {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
  san: string;
  fen: string;
  whiteMs: number;
  blackMs: number;
  at: number;
};

type SideView = {
  bot: boolean;
  name: string;
  username?: string;
  publicId?: string;
  displayName?: string;
  avatar?: string | null;
  rating?: number;
  level?: string;
  style?: string;
  bio?: string;
  online?: boolean;
};

export type GameView = {
  id: number;
  code: string | null;
  status: string;
  result: string | null;
  reason: string | null;
  pool: string;
  baseMs: number;
  incMs: number;
  rated: boolean;
  fen: string;
  pgn: string;
  moves: { san: string; from: string; to: string; fen: string }[];
  white: SideView | null;
  black: SideView | null;
  whiteMs: number;
  blackMs: number;
  turnStartedAt: number | null;
  serverNow: number;
  yourColor: "w" | "b" | null;
  drawOfferedBy: number | null;
  awaitingYou: boolean;
  tournamentId: number | null;
  round: number | null;
  deltas: { userId: number; delta: number; rating: number }[];
  createdAt: string;
};

const locks = new Set<number>();
const drawOffers = new Map<number, number>();
let notify: (userId: number, payload: unknown) => void = () => {};
let online: (userId: number) => boolean = () => false;

export function setGameHooks(hooks: {
  notify: (userId: number, payload: unknown) => void;
  online: (userId: number) => boolean;
}): void {
  notify = hooks.notify;
  online = hooks.online;
}

async function withLock<T>(id: number, fn: () => Promise<T> | T): Promise<T> {
  while (locks.has(id)) await new Promise((resolve) => setTimeout(resolve, 12));
  locks.add(id);
  try {
    return await fn();
  } finally {
    locks.delete(id);
  }
}

export function movesOf(game: GameRow): StoredMove[] {
  return JSON.parse(game.moves) as StoredMove[];
}

export function chessOf(game: GameRow): Chess {
  const chess = new Chess();
  for (const move of movesOf(game)) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return chess;
}

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = crypto.randomBytes(6);
    let value = "";
    for (let i = 0; i < 6; i++) value += alphabet[bytes[i]! % alphabet.length];
    if (!one("SELECT id FROM games WHERE code = ?", value)) return value;
  }
  throw new Error("Falha ao gerar código.");
}

function sideView(userId: number | null, bot: string | null, style: string | null, pool: string): SideView | null {
  if (bot) {
    const level = botById(bot);
    const styleName = style === "agressivo" ? "Agressivo" : style === "posicional" ? "Posicional" : style === "solido" ? "Sólido" : style === "tatico" ? "Tático" : "Equilibrado";
    return {
      bot: true,
      level: level?.id ?? bot,
      name: level?.name ?? "Bot",
      style: `${level?.title ?? "Bot"} · ${styleName}`,
      bio: level?.blurb,
      rating: level?.elo,
      avatar: level?.avatar ?? "knight",
    };
  }
  if (!userId) return null;
  const user = one<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  if (!user) return null;
  const rating = ratingsFor(userId)[pool]?.rating ?? 1200;
  return {
    bot: false,
    name: user.display_name,
    username: user.username,
    publicId: user.public_id,
    displayName: user.display_name,
    avatar: safeAvatar(user.avatar),
    rating,
    online: online(userId),
  };
}

export function serialize(game: GameRow, viewerId?: number): GameView {
  const chess = chessOf(game);
  const moves = movesOf(game);
  chess.header("White", sideView(game.white_id, game.white_bot, game.white_style, game.pool)?.name ?? "Brancas");
  chess.header("Black", sideView(game.black_id, game.black_bot, game.black_style, game.pool)?.name ?? "Pretas");
  if (game.result) chess.header("Result", game.result);
  const deltas = many<{ user_id: number; delta: number; rating: number }>(
    "SELECT user_id, delta, rating FROM rating_events WHERE game_id = ?",
    game.id,
  );
  return {
    id: game.id,
    code: game.code,
    status: game.status,
    result: game.result,
    reason: game.reason,
    pool: game.pool,
    baseMs: game.base_ms,
    incMs: game.inc_ms,
    rated: Boolean(game.rated),
    fen: chess.fen(),
    pgn: chess.pgn(),
    moves: moves.map((move) => ({ san: move.san, from: move.from, to: move.to, fen: move.fen })),
    white: sideView(game.white_id, game.white_bot, game.white_style, game.pool),
    black: sideView(game.black_id, game.black_bot, game.black_style, game.pool),
    whiteMs: game.white_ms,
    blackMs: game.black_ms,
    turnStartedAt: game.status === "active" ? game.turn_started_at : null,
    serverNow: Date.now(),
    yourColor: viewerId && viewerId === game.white_id ? "w" : viewerId && viewerId === game.black_id ? "b" : null,
    drawOfferedBy: drawOffers.get(game.id) ?? null,
    awaitingYou: Boolean(viewerId && game.status === "waiting" && game.created_by && game.created_by !== viewerId && game.white_id && game.black_id),
    tournamentId: game.tournament_id,
    round: game.round,
    deltas: deltas.map((row) => ({ userId: row.user_id, delta: row.delta, rating: row.rating })),
    createdAt: game.created_at,
  };
}

function canView(game: GameRow, viewer?: UserRow): boolean {
  if (!viewer) return game.status === "finished";
  if (viewer.id === game.white_id || viewer.id === game.black_id) return true;
  if (game.status === "finished") return true;
  if (game.tournament_id) {
    const tour = one<{ visibility: string }>("SELECT visibility FROM tournaments WHERE id = ?", game.tournament_id);
    return tour?.visibility === "public";
  }
  return false;
}

export function getGame(id: number, viewer?: UserRow): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", id);
  if (!game || !canView(game, viewer)) {
    const err = new Error("Partida não encontrada.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  return serialize(game, viewer?.id);
}

function insertGame(input: {
  whiteId?: number | null;
  blackId?: number | null;
  whiteBot?: string | null;
  blackBot?: string | null;
  whiteStyle?: string | null;
  blackStyle?: string | null;
  baseMs: number;
  incMs: number;
  rated: boolean;
  status: "waiting" | "active";
  invite?: boolean;
  tournamentId?: number | null;
  round?: number | null;
  createdBy?: number | null;
}): GameRow {
  const pool = classifyPool(input.baseMs, input.incMs);
  const active = input.status === "active";
  const inserted = run(
    `INSERT INTO games (
      code, white_id, black_id, white_bot, black_bot, white_style, black_style,
      pool, base_ms, inc_ms, rated, status, white_ms, black_ms, turn_started_at, created_at, tournament_id, round, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.invite ? code() : null,
    input.whiteId ?? null,
    input.blackId ?? null,
    input.whiteBot ?? null,
    input.blackBot ?? null,
    input.whiteStyle ?? null,
    input.blackStyle ?? null,
    pool,
    input.baseMs,
    input.incMs,
    input.rated ? 1 : 0,
    input.status,
    input.baseMs,
    input.baseMs,
    active ? Date.now() : null,
    nowIso(),
    input.tournamentId ?? null,
    input.round ?? null,
    input.createdBy ?? null,
  );
  return one<GameRow>("SELECT * FROM games WHERE id = ?", inserted.lastId)!;
}

function publish(game: GameRow): void {
  const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
  if (fresh.white_id) notify(fresh.white_id, { type: "game", game: serialize(fresh, fresh.white_id) });
  if (fresh.black_id) notify(fresh.black_id, { type: "game", game: serialize(fresh, fresh.black_id) });
}

function recordResult(userId: number, outcome: "win" | "loss" | "draw"): void {
  const column = outcome === "win" ? "wins" : outcome === "loss" ? "losses" : "draws";
  run(`UPDATE users SET games = games + 1, ${column} = ${column} + 1 WHERE id = ?`, userId);
}

function outcomeFor(userId: number, game: GameRow, result: string): "win" | "loss" | "draw" | null {
  if (userId !== game.white_id && userId !== game.black_id) return null;
  if (result === "1/2-1/2") return "draw";
  const whiteWins = result === "1-0";
  const isWhite = userId === game.white_id;
  return whiteWins === isWhite ? "win" : "loss";
}

export function finishGame(gameId: number, result: "1-0" | "0-1" | "1/2-1/2", reason: string): GameRow {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status === "finished" || game.status === "aborted") return game!;
  const plies = movesOf(game).length;
  const counts = plies >= 2 || reason === "checkmate";
  const humans = [game.white_id, game.black_id].filter((id): id is number => Boolean(id));
  const rated = Boolean(game.rated) && humans.length === 2 && counts && !game.white_bot && !game.black_bot;
  if (!counts) {
    run(
      "UPDATE games SET status = 'aborted', result = NULL, reason = 'aborted', finished_at = ?, turn_started_at = NULL WHERE id = ?",
      nowIso(),
      game.id,
    );
  } else {
    run(
      "UPDATE games SET status = 'finished', result = ?, reason = ?, finished_at = ?, turn_started_at = NULL WHERE id = ?",
      result,
      reason,
      nowIso(),
      game.id,
    );
    for (const id of humans) {
      const outcome = outcomeFor(id, game, result);
      if (outcome) recordResult(id, outcome);
    }
    if (rated && game.white_id && game.black_id) {
      const whiteScore = result === "1-0" ? 1 : result === "1/2-1/2" ? 0.5 : 0;
      applyRating({
        whiteId: game.white_id,
        blackId: game.black_id,
        pool: game.pool as PoolName,
        whiteScore,
        gameId: game.id,
      });
    }
  }
  drawOffers.delete(game.id);
  const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
  publish(fresh);
  if (fresh.tournament_id && fresh.status === "finished") {
    queueMicrotask(() => {
      import("./tournaments.ts")
        .then((mod) => mod.onGameFinished(fresh.id))
        .catch((error) => console.error(error));
    });
  }
  queueMicrotask(() => {
    import("./achievements.ts")
      .then((mod) => mod.afterGame(fresh))
      .catch((error) => console.error(error));
  });
  return fresh;
}

function terminalOf(chess: Chess): { result: "1-0" | "0-1" | "1/2-1/2"; reason: string } | null {
  if (chess.isCheckmate()) return { result: chess.turn() === "w" ? "0-1" : "1-0", reason: "checkmate" };
  if (chess.isStalemate()) return { result: "1/2-1/2", reason: "stalemate" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2", reason: "repetition" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", reason: "insufficient" };
  if (chess.isDraw()) return { result: "1/2-1/2", reason: "draw" };
  return null;
}

function clocksAfterMove(game: GameRow, chessBefore: Chess, now: number): { whiteMs: number; blackMs: number } | "flag" {
  const started = game.turn_started_at ?? now;
  const elapsed = Math.max(0, now - started);
  let white = game.white_ms;
  let black = game.black_ms;
  if (chessBefore.turn() === "w") {
    white -= elapsed;
    if (white <= 0) return "flag";
    white += game.inc_ms;
  } else {
    black -= elapsed;
    if (black <= 0) return "flag";
    black += game.inc_ms;
  }
  return { whiteMs: white, blackMs: black };
}

async function maybeBot(gameId: number): Promise<void> {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status !== "active") return;
  const chess = chessOf(game);
  const botId = chess.turn() === "w" ? game.white_bot : game.black_bot;
  const style = chess.turn() === "w" ? game.white_style : game.black_style;
  if (!botId) return;
  const started = Date.now();
  const choice = await chooseMove(chess.fen(), botId, style ?? "equilibrado");
  if (!choice) return;
  await applyMove(gameId, null, choice.from, choice.to, choice.promotion, started);
}

export async function applyMove(
  gameId: number,
  user: UserRow | null,
  from: string,
  to: string,
  promotion?: string,
  thinkStarted?: number,
): Promise<GameView> {
  return withLock(gameId, async () => {
    const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
    if (!game || game.status !== "active") {
      const err = new Error("Esta partida não está em andamento.") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const chess = chessOf(game);
    const botId = chess.turn() === "w" ? game.white_bot : game.black_bot;
    const playerId = chess.turn() === "w" ? game.white_id : game.black_id;
    if (botId) {
      if (user) {
        const err = new Error("Aguarde o lance do bot.") as Error & { status: number };
        err.status = 403;
        throw err;
      }
    } else if (!user || user.id !== playerId) {
      const err = new Error("Não é o seu turno.") as Error & { status: number };
      err.status = 403;
      throw err;
    }
    const now = Date.now();
    const clock = clocksAfterMove(game, chess, thinkStarted ?? now);
    if (clock === "flag") {
      const result = chess.turn() === "w" ? "0-1" : "1-0";
      return serialize(finishGame(game.id, result, "timeout"), user?.id);
    }
    const promo = promotion === "q" || promotion === "r" || promotion === "b" || promotion === "n" ? promotion : undefined;
    let played;
    try {
      played = chess.move({ from: from as Square, to: to as Square, promotion: promo });
    } catch {
      const err = new Error("Lance ilegal.") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    const stored = movesOf(game);
    stored.push({
      from: played.from,
      to: played.to,
      promotion: played.promotion === "q" || played.promotion === "r" || played.promotion === "b" || played.promotion === "n" ? played.promotion : undefined,
      san: played.san,
      fen: chess.fen(),
      whiteMs: clock.whiteMs,
      blackMs: clock.blackMs,
      at: now,
    });
    run(
      "UPDATE games SET moves = ?, white_ms = ?, black_ms = ?, turn_started_at = ? WHERE id = ?",
      JSON.stringify(stored),
      clock.whiteMs,
      clock.blackMs,
      now,
      game.id,
    );
    drawOffers.delete(game.id);
    const done = terminalOf(chess);
    if (done) {
      const finished = finishGame(game.id, done.result, done.reason);
      return serialize(finished, user?.id);
    }
    publish(one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!);
    const current = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
    const nextBot = chess.turn() === "w" ? current.white_bot : current.black_bot;
    if (nextBot) {
      setTimeout(() => {
        maybeBot(game.id).catch((error) => console.error(error));
      }, 180);
    }
    return serialize(current, user?.id);
  });
}

export async function createBotGame(user: UserRow, input: {
  level: string;
  style: string;
  color: "white" | "black" | "random";
  baseMs: number;
  incMs: number;
}): Promise<GameView> {
  if (!botById(input.level)) {
    const err = new Error("Nível de bot inválido.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  const style: StyleId = styleById(input.style);
  const playBlack = input.color === "black" || (input.color === "random" && Math.random() < 0.5);
  const game = insertGame({
    whiteId: playBlack ? null : user.id,
    blackId: playBlack ? user.id : null,
    whiteBot: playBlack ? input.level : null,
    blackBot: playBlack ? null : input.level,
    whiteStyle: playBlack ? style : null,
    blackStyle: playBlack ? null : style,
    baseMs: input.baseMs,
    incMs: input.incMs,
    rated: false,
    status: "active",
  });
  if (playBlack) await maybeBot(game.id);
  return serialize(one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!, user.id);
}

export function createInvite(user: UserRow, input: { baseMs: number; incMs: number; rated: boolean; friendId?: number; color: "white" | "black" | "random" }): GameView {
  if (input.friendId) {
    const prefs = one<{ preferences: string }>("SELECT preferences FROM users WHERE id = ?", input.friendId);
    const allow = prefs ? JSON.parse(prefs.preferences).allowInvites !== false : false;
    const friend = one(
      `SELECT id FROM friendships WHERE status = 'accepted' AND (
        (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
      )`,
      user.id,
      input.friendId,
      input.friendId,
      user.id,
    );
    if (!friend) {
      const err = new Error("Você só pode convidar amigos.") as Error & { status: number };
      err.status = 403;
      throw err;
    }
    if (!allow) {
      const err = new Error("Esse jogador não está aceitando convites.") as Error & { status: number };
      err.status = 403;
      throw err;
    }
  }
  const playBlack = input.color === "black" || (input.color === "random" && Math.random() < 0.5);
  const game = insertGame({
    whiteId: playBlack ? input.friendId ?? null : user.id,
    blackId: playBlack ? user.id : input.friendId ?? null,
    baseMs: input.baseMs,
    incMs: input.incMs,
    rated: input.rated,
    status: "waiting",
    invite: true,
    createdBy: user.id,
  });
  if (input.friendId) notify(input.friendId, { type: "invite", game: serialize(game, input.friendId) });
  return serialize(game, user.id);
}

export function joinByCode(user: UserRow, rawCode: string): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE code = ?", rawCode.trim().toUpperCase());
  if (!game || game.status !== "waiting") {
    const err = new Error("Convite inválido ou expirado.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (game.white_id === user.id || game.black_id === user.id) return serialize(game, user.id);
  if (game.white_id && game.black_id) {
    const err = new Error("Essa partida já tem dois jogadores.") as Error & { status: number };
    err.status = 409;
    throw err;
  }
  if (!game.white_id) run("UPDATE games SET white_id = ? WHERE id = ?", user.id, game.id);
  else run("UPDATE games SET black_id = ? WHERE id = ?", user.id, game.id);
  run("UPDATE games SET status = 'active', turn_started_at = ?, white_ms = base_ms, black_ms = base_ms WHERE id = ?", Date.now(), game.id);
  const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
  publish(fresh);
  return serialize(fresh, user.id);
}

export function acceptInvite(user: UserRow, gameId: number): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status !== "waiting") {
    const err = new Error("Convite não encontrado.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (game.created_by === user.id || (game.white_id !== user.id && game.black_id !== user.id)) {
    const err = new Error("Esse convite não é seu.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  if (!game.white_id || !game.black_id) {
    const err = new Error("Ainda falta um jogador.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  run(
    "UPDATE games SET status = 'active', turn_started_at = ?, white_ms = base_ms, black_ms = base_ms WHERE id = ?",
    Date.now(),
    game.id,
  );
  const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
  publish(fresh);
  return serialize(fresh, user.id);
}

export function declineInvite(user: UserRow, gameId: number): void {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status !== "waiting") return;
  if (game.white_id !== user.id && game.black_id !== user.id) return;
  run("UPDATE games SET status = 'aborted', reason = 'declined', finished_at = ? WHERE id = ?", nowIso(), game.id);
  publish(one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!);
}

export function enqueueSeek(user: UserRow, input: { baseMs: number; incMs: number; rated: boolean }): { waiting: true } | { game: GameView } {
  const pool: Pool = classifyPool(input.baseMs, input.incMs);
  const match = one<{ user_id: number }>(
    `SELECT user_id FROM seeks WHERE user_id != ? AND base_ms = ? AND inc_ms = ? AND rated = ? ORDER BY created_at LIMIT 1`,
    user.id,
    input.baseMs,
    input.incMs,
    input.rated ? 1 : 0,
  );
  run("DELETE FROM seeks WHERE user_id = ?", user.id);
  if (!match) {
    run(
      "INSERT INTO seeks (user_id, pool, base_ms, inc_ms, rated, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      user.id,
      pool,
      input.baseMs,
      input.incMs,
      input.rated ? 1 : 0,
      nowIso(),
    );
    return { waiting: true };
  }
  run("DELETE FROM seeks WHERE user_id = ?", match.user_id);
  const creatorBlack = Math.random() < 0.5;
  const game = insertGame({
    whiteId: creatorBlack ? match.user_id : user.id,
    blackId: creatorBlack ? user.id : match.user_id,
    baseMs: input.baseMs,
    incMs: input.incMs,
    rated: input.rated,
    status: "active",
  });
  publish(game);
  notify(match.user_id, { type: "matched", game: serialize(game, match.user_id) });
  return { game: serialize(game, user.id) };
}

export function cancelSeek(userId: number): void {
  run("DELETE FROM seeks WHERE user_id = ?", userId);
}

export function resign(user: UserRow, gameId: number): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status !== "active") {
    const err = new Error("Partida indisponível.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  if (user.id !== game.white_id && user.id !== game.black_id) {
    const err = new Error("Você não joga esta partida.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  const result = user.id === game.white_id ? "0-1" : "1-0";
  return serialize(finishGame(game.id, result, "resign"), user.id);
}

export function offerDraw(user: UserRow, gameId: number, accept: boolean): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game || game.status !== "active") {
    const err = new Error("Partida indisponível.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  if (user.id !== game.white_id && user.id !== game.black_id) {
    const err = new Error("Você não joga esta partida.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  const pending = drawOffers.get(game.id);
  if (accept) {
    if (!pending || pending === user.id) {
      const err = new Error("Não há oferta de empate do adversário.") as Error & { status: number };
      err.status = 400;
      throw err;
    }
    return serialize(finishGame(game.id, "1/2-1/2", "agreement"), user.id);
  }
  if (pending === user.id) {
    drawOffers.delete(game.id);
  } else {
    drawOffers.set(game.id, user.id);
  }
  publish(game);
  return serialize(one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!, user.id);
}

export function abortGame(user: UserRow, gameId: number): GameView {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game) {
    const err = new Error("Partida não encontrada.") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (user.id !== game.white_id && user.id !== game.black_id) {
    const err = new Error("Você não joga esta partida.") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  if (game.status === "waiting") {
    run("UPDATE games SET status = 'aborted', reason = 'cancelled', finished_at = ? WHERE id = ?", nowIso(), game.id);
    const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
    publish(fresh);
    return serialize(fresh, user.id);
  }
  if (movesOf(game).length >= 2) {
    const err = new Error("Depois do primeiro lance de cada lado, use rendição.") as Error & { status: number };
    err.status = 400;
    throw err;
  }
  run("UPDATE games SET status = 'aborted', reason = 'aborted', finished_at = ?, turn_started_at = NULL WHERE id = ?", nowIso(), game.id);
  const fresh = one<GameRow>("SELECT * FROM games WHERE id = ?", game.id)!;
  publish(fresh);
  return serialize(fresh, user.id);
}

export function tickClocks(): void {
  const games = many<GameRow>("SELECT * FROM games WHERE status = 'active'");
  const now = Date.now();
  for (const game of games) {
    if (!game.turn_started_at || locks.has(game.id)) continue;
    const moves = movesOf(game);
    const turn = moves.length ? (moves[moves.length - 1]!.fen.split(" ")[1] as "w" | "b") : "w";
    const remain = (turn === "w" ? game.white_ms : game.black_ms) - (now - game.turn_started_at);
    if (remain <= 0) finishGame(game.id, turn === "w" ? "0-1" : "1-0", "timeout");
  }
}

export function listGames(userId: number, limit = 20) {
  return many<GameRow>(
    `SELECT * FROM games WHERE white_id = ? OR black_id = ? ORDER BY id DESC LIMIT ?`,
    userId,
    userId,
    limit,
  ).map((game) => serialize(game, userId));
}

export function pendingInvites(userId: number) {
  return many<GameRow>(
    `SELECT * FROM games WHERE status = 'waiting' AND (white_id = ? OR black_id = ?) ORDER BY id DESC`,
    userId,
    userId,
  )
    .filter((game) => game.white_id && game.black_id && game.created_by !== userId)
    .map((game) => serialize(game, userId));
}

export function createPairedGame(input: {
  whiteId: number;
  blackId: number;
  baseMs: number;
  incMs: number;
  tournamentId: number;
  round: number;
}): number {
  const game = insertGame({
    whiteId: input.whiteId,
    blackId: input.blackId,
    baseMs: input.baseMs,
    incMs: input.incMs,
    rated: true,
    status: "active",
    tournamentId: input.tournamentId,
    round: input.round,
  });
  publish(game);
  return game.id;
}

export function overview() {
  const players = one<{ c: number }>("SELECT COUNT(*) AS c FROM users")!;
  const games = one<{ c: number }>("SELECT COUNT(*) AS c FROM games WHERE status = 'finished'")!;
  const today = one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM games WHERE status = 'finished' AND finished_at >= ?",
    new Date(Date.now() - 86400000).toISOString(),
  )!;
  const active = one<{ c: number }>("SELECT COUNT(*) AS c FROM games WHERE status = 'active'")!;
  return { players: players.c, games: games.c, gamesToday: today.c, active: active.c };
}

void db;
