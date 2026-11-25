import crypto from "node:crypto";
import { classifyPool } from "../../shared/time.ts";
import { httpError, safeAvatar } from "./auth.ts";
import { many, nowIso, one, run, type GameRow, type UserRow } from "./db.ts";
import { unlock } from "./achievements.ts";
import { createPairedGame } from "./games.ts";

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let value = "";
  for (let i = 0; i < 6; i++) value += alphabet[bytes[i]! % alphabet.length];
  return value;
}

export function listTournaments(userId?: number) {
  const rows = many<{
    id: number;
    name: string;
    visibility: string;
    join_code: string | null;
    host_id: number;
    pool: string;
    base_ms: number;
    inc_ms: number;
    rounds: number;
    max_players: number;
    status: string;
    current_round: number;
    created_at: string;
    players: number;
  }>(
    `SELECT t.*, (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id) AS players
     FROM tournaments t
     WHERE t.visibility = 'public' OR t.host_id = ?
     ORDER BY t.id DESC LIMIT 40`,
    userId ?? 0,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    joinCode: row.host_id === userId || row.visibility === "public" ? row.join_code : null,
    pool: row.pool,
    baseMs: row.base_ms,
    incMs: row.inc_ms,
    rounds: row.rounds,
    maxPlayers: row.max_players,
    status: row.status,
    currentRound: row.current_round,
    createdAt: row.created_at,
    players: row.players,
    yours: row.host_id === userId,
  }));
}

export function createTournament(user: UserRow, input: {
  name: string;
  visibility: "public" | "private";
  baseMs: number;
  incMs: number;
  rounds: number;
  maxPlayers: number;
}) {
  const name = input.name.trim();
  if (name.length < 3 || name.length > 40) throw httpError(400, "Dê um nome de 3 a 40 caracteres.");
  const rounds = Math.min(7, Math.max(1, Math.round(input.rounds)));
  const maxPlayers = Math.min(16, Math.max(2, Math.round(input.maxPlayers)));
  const visibility = input.visibility === "private" ? "private" : "public";
  const inserted = run(
    `INSERT INTO tournaments (name, visibility, join_code, host_id, pool, base_ms, inc_ms, rounds, max_players, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'registration', ?)`,
    name,
    visibility,
    visibility === "private" ? makeCode() : null,
    user.id,
    classifyPool(input.baseMs, input.incMs),
    input.baseMs,
    input.incMs,
    rounds,
    maxPlayers,
    nowIso(),
  );
  run("INSERT INTO tournament_players (tournament_id, user_id, score) VALUES (?, ?, 0)", inserted.lastId, user.id);
  unlock(user.id, "tournament_player");
  return detail(inserted.lastId, user);
}

export function joinTournament(user: UserRow, id: number, code?: string) {
  const tour = one<{
    id: number;
    status: string;
    visibility: string;
    join_code: string | null;
    max_players: number;
  }>("SELECT * FROM tournaments WHERE id = ?", id);
  if (!tour) throw httpError(404, "Torneio não encontrado.");
  if (tour.status !== "registration") throw httpError(400, "As inscrições estão encerradas.");
  if (tour.visibility === "private" && tour.join_code !== (code ?? "").trim().toUpperCase()) {
    throw httpError(403, "Código do torneio inválido.");
  }
  const count = one<{ c: number }>("SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id = ?", id)!;
  if (count.c >= tour.max_players) throw httpError(409, "O torneio está cheio.");
  const already = one("SELECT user_id FROM tournament_players WHERE tournament_id = ? AND user_id = ?", id, user.id);
  if (!already) {
    run("INSERT INTO tournament_players (tournament_id, user_id, score) VALUES (?, ?, 0)", id, user.id);
    unlock(user.id, "tournament_player");
  }
  return detail(id, user);
}

function pair(tournamentId: number, round: number) {
  const tour = one<{ base_ms: number; inc_ms: number; pool: string; rounds: number }>(
    "SELECT * FROM tournaments WHERE id = ?",
    tournamentId,
  )!;
  const players = many<{ user_id: number; score: number; rating: number }>(
    `SELECT p.user_id, p.score, COALESCE(r.rating, 1200) AS rating
     FROM tournament_players p
     LEFT JOIN ratings r ON r.user_id = p.user_id AND r.pool = ?
     WHERE p.tournament_id = ?`,
    tour.pool,
    tournamentId,
  );
  const previous = new Set(
    many<{ white_id: number; black_id: number }>(
      "SELECT white_id, black_id FROM games WHERE tournament_id = ? AND white_id IS NOT NULL AND black_id IS NOT NULL",
      tournamentId,
    ).map((game) => [game.white_id, game.black_id].sort().join("-")),
  );
  const byes = new Set(
    many<{ user_id: number }>("SELECT user_id FROM tournament_byes WHERE tournament_id = ?", tournamentId).map((row) => row.user_id),
  );
  const sorted = [...players].sort((a, b) => b.score - a.score || b.rating - a.rating);
  if (sorted.length % 2 === 1) {
    const candidate = [...sorted].reverse().find((player) => !byes.has(player.user_id)) ?? sorted[sorted.length - 1]!;
    const index = sorted.findIndex((player) => player.user_id === candidate.user_id);
    sorted.splice(index, 1);
    run("INSERT INTO tournament_byes (tournament_id, round, user_id) VALUES (?, ?, ?)", tournamentId, round, candidate.user_id);
    run("UPDATE tournament_players SET score = score + 1 WHERE tournament_id = ? AND user_id = ?", tournamentId, candidate.user_id);
  }
  const used = new Set<number>();
  for (const player of sorted) {
    if (used.has(player.user_id)) continue;
    const rival =
      sorted.find((other) => other.user_id !== player.user_id && !used.has(other.user_id) && !previous.has([player.user_id, other.user_id].sort().join("-"))) ??
      sorted.find((other) => other.user_id !== player.user_id && !used.has(other.user_id));
    if (!rival) continue;
    used.add(player.user_id);
    used.add(rival.user_id);
    const swap = round % 2 === 0;
    createPairedGame({
      whiteId: swap ? rival.user_id : player.user_id,
      blackId: swap ? player.user_id : rival.user_id,
      baseMs: tour.base_ms,
      incMs: tour.inc_ms,
      tournamentId,
      round,
    });
  }
}

export function startTournament(user: UserRow, id: number) {
  const tour = one<{ host_id: number; status: string; rounds: number }>("SELECT * FROM tournaments WHERE id = ?", id);
  if (!tour) throw httpError(404, "Torneio não encontrado.");
  if (tour.host_id !== user.id) throw httpError(403, "Só quem criou o torneio pode iniciá-lo.");
  if (tour.status !== "registration") throw httpError(400, "O torneio já começou.");
  const count = one<{ c: number }>("SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id = ?", id)!;
  if (count.c < 2) throw httpError(400, "São necessários pelo menos dois jogadores.");
  run("UPDATE tournaments SET status = 'active', current_round = 1 WHERE id = ?", id);
  pair(id, 1);
  return detail(id, user);
}

export function onGameFinished(gameId: number): void {
  const game = one<GameRow>("SELECT * FROM games WHERE id = ?", gameId);
  if (!game?.tournament_id || game.status !== "finished" || !game.result) return;
  const points = (id: number | null) => {
    if (!id) return;
    const score = game.result === "1/2-1/2" ? 0.5 : (game.result === "1-0" && id === game.white_id) || (game.result === "0-1" && id === game.black_id) ? 1 : 0;
    run("UPDATE tournament_players SET score = score + ? WHERE tournament_id = ? AND user_id = ?", score, game.tournament_id!, id);
  };
  points(game.white_id);
  points(game.black_id);
  const tour = one<{ rounds: number; current_round: number; status: string }>("SELECT * FROM tournaments WHERE id = ?", game.tournament_id);
  if (!tour || tour.status !== "active" || tour.current_round !== game.round) return;
  const open = one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM games WHERE tournament_id = ? AND round = ? AND status = 'active'",
    game.tournament_id,
    game.round,
  )!;
  if (open.c > 0) return;
  if (tour.current_round >= tour.rounds) {
    run("UPDATE tournaments SET status = 'finished' WHERE id = ?", game.tournament_id);
    const winner = one<{ user_id: number }>(
      "SELECT user_id FROM tournament_players WHERE tournament_id = ? ORDER BY score DESC, user_id ASC LIMIT 1",
      game.tournament_id,
    );
    if (winner) unlock(winner.user_id, "tournament_winner");
    return;
  }
  const next = tour.current_round + 1;
  run("UPDATE tournaments SET current_round = ? WHERE id = ?", next, game.tournament_id);
  pair(game.tournament_id, next);
}

export function detail(id: number, viewer?: UserRow) {
  const tour = one<{
    id: number;
    name: string;
    visibility: string;
    join_code: string | null;
    host_id: number;
    pool: string;
    base_ms: number;
    inc_ms: number;
    rounds: number;
    max_players: number;
    status: string;
    current_round: number;
    created_at: string;
  }>("SELECT * FROM tournaments WHERE id = ?", id);
  if (!tour) throw httpError(404, "Torneio não encontrado.");
  const member = viewer
    ? one("SELECT user_id FROM tournament_players WHERE tournament_id = ? AND user_id = ?", id, viewer.id)
    : undefined;
  if (tour.visibility === "private" && tour.host_id !== viewer?.id && !member) throw httpError(404, "Torneio não encontrado.");
  const players = many<{ user_id: number; score: number; username: string; display_name: string; public_id: string; avatar: string | null }>(
    `SELECT p.user_id, p.score, u.username, u.display_name, u.public_id, u.avatar
     FROM tournament_players p JOIN users u ON u.id = p.user_id
     WHERE p.tournament_id = ?
     ORDER BY p.score DESC, u.username ASC`,
    id,
  );
  const games = many<GameRow>("SELECT * FROM games WHERE tournament_id = ? ORDER BY round, id", id);
  return {
    id: tour.id,
    name: tour.name,
    visibility: tour.visibility,
    joinCode: tour.visibility === "public" || tour.host_id === viewer?.id || member ? tour.join_code : null,
    pool: tour.pool,
    baseMs: tour.base_ms,
    incMs: tour.inc_ms,
    rounds: tour.rounds,
    maxPlayers: tour.max_players,
    status: tour.status,
    currentRound: tour.current_round,
    createdAt: tour.created_at,
    hostId: tour.host_id,
    isHost: viewer?.id === tour.host_id,
    joined: Boolean(member),
    standings: players.map((player, index) => ({
      rank: index + 1,
      userId: player.user_id,
      username: player.username,
      displayName: player.display_name,
      publicId: player.public_id,
      avatar: safeAvatar(player.avatar),
      score: player.score,
    })),
    games: games.map((game) => ({
      id: game.id,
      round: game.round,
      status: game.status,
      result: game.result,
      whiteId: game.white_id,
      blackId: game.black_id,
    })),
  };
}
