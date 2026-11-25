import { many, nowIso, one, run, type GameRow, type UserRow } from "./db.ts";
import { botById } from "./engine.ts";

export const ACHIEVEMENTS = [
  { id: "first_game", name: "Primeiro lance", description: "Conclua uma partida.", tier: "bronze" },
  { id: "first_win", name: "Primeira vitória", description: "Vença uma partida.", tier: "bronze" },
  { id: "wins_10", name: "Dez vitórias", description: "Acumule 10 vitórias.", tier: "silver" },
  { id: "wins_50", name: "Cinquenta vitórias", description: "Acumule 50 vitórias.", tier: "gold" },
  { id: "games_25", name: "Em atividade", description: "Conclua 25 partidas.", tier: "silver" },
  { id: "games_100", name: "Veterano", description: "Conclua 100 partidas.", tier: "gold" },
  { id: "rating_1400", name: "Clube", description: "Alcance 1400 em qualquer ritmo.", tier: "bronze" },
  { id: "rating_1600", name: "Candidato", description: "Alcance 1600 de rating.", tier: "silver" },
  { id: "rating_1800", name: "Mestre de salão", description: "Alcance 1800 de rating.", tier: "gold" },
  { id: "rating_2000", name: "Elite", description: "Alcance 2000 de rating.", tier: "gold" },
  { id: "beat_master", name: "Caçador de mestres", description: "Vença um bot de 1800 ou mais.", tier: "gold" },
  { id: "first_friend", name: "Aliança", description: "Tenha um amigo aceito.", tier: "bronze" },
  { id: "tournament_player", name: "Inscrito", description: "Entre em um torneio.", tier: "bronze" },
  { id: "tournament_winner", name: "Campeão", description: "Vença um torneio.", tier: "gold" },
  { id: "streak_3", name: "Sequência", description: "Vença três partidas seguidas.", tier: "silver" },
  { id: "analyst", name: "Olho clínico", description: "Analise uma partida concluída.", tier: "bronze" },
  { id: "classic_game", name: "Longa duração", description: "Conclua uma partida clássica.", tier: "silver" },
] as const;

export function unlock(userId: number, achievementId: string): boolean {
  const exists = one("SELECT user_id FROM user_achievements WHERE user_id = ? AND achievement_id = ?", userId, achievementId);
  if (exists) return false;
  run(
    "INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)",
    userId,
    achievementId,
    nowIso(),
  );
  return true;
}

export function listFor(userId: number) {
  const rows = many<{ achievement_id: string; unlocked_at: string }>(
    "SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?",
    userId,
  );
  return ACHIEVEMENTS.map((item) => {
    const got = rows.find((row) => row.achievement_id === item.id);
    return { ...item, unlockedAt: got?.unlocked_at ?? null };
  });
}

export function recent(userId: number) {
  return listFor(userId)
    .filter((item) => item.unlockedAt)
    .sort((a, b) => (a.unlockedAt! < b.unlockedAt! ? 1 : -1))
    .slice(0, 4);
}

function won(userId: number, game: GameRow): boolean {
  if (game.result === "1-0") return game.white_id === userId;
  if (game.result === "0-1") return game.black_id === userId;
  return false;
}

export function afterGame(game: GameRow): void {
  if (game.status !== "finished") return;
  const ids = [game.white_id, game.black_id].filter((id): id is number => Boolean(id));
  for (const id of ids) {
    const user = one<UserRow>("SELECT * FROM users WHERE id = ?", id);
    if (!user) continue;
    unlock(id, "first_game");
    if (won(id, game)) unlock(id, "first_win");
    if (user.wins >= 10) unlock(id, "wins_10");
    if (user.wins >= 50) unlock(id, "wins_50");
    if (user.games >= 25) unlock(id, "games_25");
    if (user.games >= 100) unlock(id, "games_100");
    if (game.pool === "classical") unlock(id, "classic_game");
    const best = one<{ peak: number }>("SELECT MAX(peak) AS peak FROM ratings WHERE user_id = ?", id);
    const peak = best?.peak ?? 1200;
    if (peak >= 1400) unlock(id, "rating_1400");
    if (peak >= 1600) unlock(id, "rating_1600");
    if (peak >= 1800) unlock(id, "rating_1800");
    if (peak >= 2000) unlock(id, "rating_2000");
    const bot = id === game.white_id ? game.black_bot : game.white_bot;
    if (won(id, game) && bot && (botById(bot)?.elo ?? 0) >= 1800) unlock(id, "beat_master");
    const last = many<{ result: string | null; white_id: number | null; black_id: number | null }>(
      `SELECT result, white_id, black_id FROM games
       WHERE status = 'finished' AND (white_id = ? OR black_id = ?)
       ORDER BY id DESC LIMIT 3`,
      id,
      id,
    );
    if (last.length === 3 && last.every((item) => won(id, item as GameRow))) unlock(id, "streak_3");
  }
}

export function challenges(userId: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const iso = start.toISOString();
  const played = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM games WHERE status = 'finished' AND finished_at >= ? AND (white_id = ? OR black_id = ?)`,
    iso,
    userId,
    userId,
  )!.c;
  const wins = many<GameRow>(
    `SELECT * FROM games WHERE status = 'finished' AND finished_at >= ? AND (white_id = ? OR black_id = ?)`,
    iso,
    userId,
    userId,
  ).filter((game) => won(userId, game)).length;
  const friendGames = one<{ c: number }>(
    `SELECT COUNT(*) AS c FROM games
     WHERE status = 'finished' AND finished_at >= ? AND white_bot IS NULL AND black_bot IS NULL
       AND ((white_id = ? AND black_id IS NOT NULL) OR (black_id = ? AND white_id IS NOT NULL))`,
    iso,
    userId,
    userId,
  )!.c;
  return [
    { id: "play_today", name: "Jogue hoje", description: "Conclua uma partida hoje.", progress: played, target: 1 },
    { id: "win_today", name: "Vitória do dia", description: "Vença uma partida hoje.", progress: wins, target: 1 },
    { id: "friend_today", name: "Contra um humano", description: "Conclua uma partida contra outro jogador hoje.", progress: friendGames, target: 1 },
  ].map((item) => ({ ...item, done: item.progress >= item.target, progress: Math.min(item.progress, item.target) }));
}
