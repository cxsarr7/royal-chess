import { many, nowIso, one, run } from "./db.js";

export type PoolName = "bullet" | "blitz" | "rapid" | "classical";

function kFactor(games: number): number {
  return games < 30 ? 32 : 20;
}

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

export function applyRating(input: {
  whiteId: number;
  blackId: number;
  pool: PoolName;
  whiteScore: number;
  gameId: number;
}): { white: { rating: number; delta: number }; black: { rating: number; delta: number } } {
  const white = one<{ rating: number; games: number }>(
    "SELECT rating, games FROM ratings WHERE user_id = ? AND pool = ?",
    input.whiteId,
    input.pool,
  );
  const black = one<{ rating: number; games: number }>(
    "SELECT rating, games FROM ratings WHERE user_id = ? AND pool = ?",
    input.blackId,
    input.pool,
  );
  if (!white || !black) throw new Error("Rating ausente.");
  const whiteDelta = Math.round(kFactor(white.games) * (input.whiteScore - expectedScore(white.rating, black.rating)));
  const blackDelta = Math.round(
    kFactor(black.games) * (1 - input.whiteScore - expectedScore(black.rating, white.rating)),
  );
  const whiteRating = white.rating + whiteDelta;
  const blackRating = black.rating + blackDelta;
  const stamp = nowIso();
  for (const side of [
    { id: input.whiteId, rating: whiteRating, delta: whiteDelta },
    { id: input.blackId, rating: blackRating, delta: blackDelta },
  ]) {
    run(
      `UPDATE ratings SET rating = ?, peak = MAX(peak, ?), games = games + 1 WHERE user_id = ? AND pool = ?`,
      side.rating,
      side.rating,
      side.id,
      input.pool,
    );
    run(
      `INSERT INTO rating_events (user_id, pool, rating, delta, game_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      side.id,
      input.pool,
      side.rating,
      side.delta,
      input.gameId,
      stamp,
    );
  }
  return {
    white: { rating: whiteRating, delta: whiteDelta },
    black: { rating: blackRating, delta: blackDelta },
  };
}

export function leaderboard(pool: PoolName, period: "all" | "week" | "month") {
  if (period === "all") {
    return many<{
      public_id: string;
      username: string;
      display_name: string;
      avatar: string | null;
      rating: number;
      peak: number;
      games: number;
      delta: number;
    }>(
      `SELECT u.public_id, u.username, u.display_name, u.avatar, r.rating, r.peak, r.games, 0 AS delta
       FROM ratings r JOIN users u ON u.id = r.user_id
       WHERE r.pool = ? AND r.games > 0
       ORDER BY r.rating DESC, r.peak DESC, u.username ASC
       LIMIT 50`,
      pool,
    );
  }
  const since = new Date(Date.now() - (period === "week" ? 7 : 30) * 86400000).toISOString();
  return many<{
    public_id: string;
    username: string;
    display_name: string;
    avatar: string | null;
    rating: number;
    peak: number;
    games: number;
    delta: number;
  }>(
    `SELECT u.public_id, u.username, u.display_name, u.avatar, r.rating, r.peak, r.games,
            COALESCE(SUM(e.delta), 0) AS delta
     FROM rating_events e
     JOIN users u ON u.id = e.user_id
     JOIN ratings r ON r.user_id = u.id AND r.pool = e.pool
     WHERE e.pool = ? AND e.created_at >= ?
     GROUP BY u.id
     ORDER BY delta DESC, r.rating DESC
     LIMIT 50`,
    pool,
    since,
  );
}

export function ratingHistory(userId: number, pool: PoolName) {
  return many<{ rating: number; delta: number; created_at: string }>(
    `SELECT rating, delta, created_at FROM rating_events
     WHERE user_id = ? AND pool = ? ORDER BY id DESC LIMIT 40`,
    userId,
    pool,
  ).reverse();
}
