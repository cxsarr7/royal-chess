import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "royal.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  avatar TEXT,
  bio TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  username_changed_at TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  peak INTEGER NOT NULL DEFAULT 1200,
  games INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, pool)
);

CREATE TABLE IF NOT EXISTS rating_events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  rating INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  game_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  white_id INTEGER REFERENCES users(id),
  black_id INTEGER REFERENCES users(id),
  white_bot TEXT,
  black_bot TEXT,
  white_style TEXT,
  black_style TEXT,
  pool TEXT NOT NULL,
  base_ms INTEGER NOT NULL,
  inc_ms INTEGER NOT NULL,
  rated INTEGER NOT NULL,
  status TEXT NOT NULL,
  result TEXT,
  reason TEXT,
  moves TEXT NOT NULL DEFAULT '[]',
  white_ms INTEGER NOT NULL,
  black_ms INTEGER NOT NULL,
  turn_started_at INTEGER,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  tournament_id INTEGER,
  round INTEGER,
  analysis TEXT,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS seeks (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pool TEXT NOT NULL,
  base_ms INTEGER NOT NULL,
  inc_ms INTEGER NOT NULL,
  rated INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL,
  join_code TEXT UNIQUE,
  host_id INTEGER NOT NULL REFERENCES users(id),
  pool TEXT NOT NULL,
  base_ms INTEGER NOT NULL,
  inc_ms INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  max_players INTEGER NOT NULL,
  status TEXT NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, user_id)
);

CREATE TABLE IF NOT EXISTS tournament_byes (
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, round)
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_games_white ON games(white_id, status);
CREATE INDEX IF NOT EXISTS idx_games_black ON games(black_id, status);
CREATE INDEX IF NOT EXISTS idx_events_user ON rating_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id, id);
`);

export type UserRow = {
  id: number;
  public_id: string;
  username: string;
  display_name: string;
  password_hash: string;
  recovery_hash: string;
  avatar: string | null;
  bio: string;
  created_at: string;
  last_seen: string;
  username_changed_at: string | null;
  preferences: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

export type GameRow = {
  id: number;
  code: string | null;
  white_id: number | null;
  black_id: number | null;
  white_bot: string | null;
  black_bot: string | null;
  white_style: string | null;
  black_style: string | null;
  pool: string;
  base_ms: number;
  inc_ms: number;
  rated: number;
  status: string;
  result: string | null;
  reason: string | null;
  moves: string;
  white_ms: number;
  black_ms: number;
  turn_started_at: number | null;
  created_at: string;
  finished_at: string | null;
  tournament_id: number | null;
  round: number | null;
  analysis: string | null;
  created_by: number | null;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function one<T>(sql: string, ...params: (string | number | null | bigint)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function many<T>(sql: string, ...params: (string | number | null | bigint)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: (string | number | null | bigint)[]): { lastId: number; changes: number } {
  const info = db.prepare(sql).run(...params);
  return { lastId: Number(info.lastInsertRowid), changes: Number(info.changes) };
}
