import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { db, many, nowIso, one, run, type UserRow } from "./db.js";
import { sessionCookie } from "./public-url.ts";

const SESSION_DAYS = 30;
const MAX_FAILURES = 8;
const LOCK_MS = 15 * 60 * 1000;
const USERNAME_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync("royal-chess-timing-pad", 8);

export type PublicUser = {
  id: number;
  publicId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  createdAt: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  ratings: Record<string, { rating: number; peak: number; games: number }>;
};

const pools = ["bullet", "blitz", "rapid", "classical"] as const;

export function publicIdLabel(publicId: string): string {
  return `#${publicId}`;
}

export function normalizeUsername(input: string): string {
  return input.trim();
}

export function usernameKey(input: string): string {
  return normalizeUsername(input).toLowerCase();
}

export function validUsername(input: string): boolean {
  return /^[A-Za-z0-9_]{3,16}$/.test(normalizeUsername(input));
}

export function parseIdentifier(input: string): { kind: "id" | "name"; value: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  const id = raw.replace(/^#/, "").toUpperCase();
  if (/^RC\d{5}$/.test(id)) return { kind: "id", value: id };
  if (validUsername(raw)) return { kind: "name", value: usernameKey(raw) };
  return null;
}

export function validPassword(input: string): boolean {
  return typeof input === "string" && input.length >= 8 && input.length <= 72;
}

export function validDisplayName(input: string): boolean {
  const name = input.trim();
  if (name.length < 2 || name.length > 24) return false;
  return !/[\u0000-\u001F]/.test(name);
}

function makePublicId(): string {
  for (let i = 0; i < 20; i++) {
    const id = `RC${crypto.randomInt(10000, 100000)}`;
    const exists = one("SELECT id FROM users WHERE public_id = ?", id);
    if (!exists) return id;
  }
  throw new Error("Não foi possível gerar um ID exclusivo.");
}

export function makeRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[bytes[i]! % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}`;
}

export function createUser(input: {
  username: string;
  displayName: string;
  password: string;
}): { user: UserRow; recoveryCode: string } {
  const username = normalizeUsername(input.username);
  if (!validUsername(username)) {
    throw httpError(400, "O usuário deve ter de 3 a 16 caracteres: letras, números ou _.");
  }
  if (!validDisplayName(input.displayName || username)) {
    throw httpError(400, "O nome de exibição deve ter entre 2 e 24 caracteres.");
  }
  if (!validPassword(input.password)) {
    throw httpError(400, "A senha precisa ter entre 8 e 72 caracteres.");
  }
  const key = usernameKey(username);
  if (one("SELECT id FROM users WHERE lower(username) = ?", key)) {
    throw httpError(409, "Esse nome de usuário já está em uso.");
  }
  const recoveryCode = makeRecoveryCode();
  const passwordHash = bcrypt.hashSync(input.password, 12);
  const recoveryHash = bcrypt.hashSync(recoveryCode, 10);
  const stamp = nowIso();
  const publicId = makePublicId();
  const displayName = input.displayName.trim() || username;
  const inserted = run(
    `INSERT INTO users (public_id, username, display_name, password_hash, recovery_hash, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    publicId,
    username,
    displayName,
    passwordHash,
    recoveryHash,
    stamp,
    stamp,
  );
  for (const pool of pools) {
    run("INSERT INTO ratings (user_id, pool, rating, peak, games) VALUES (?, ?, 1200, 1200, 0)", inserted.lastId, pool);
  }
  const user = one<UserRow>("SELECT * FROM users WHERE id = ?", inserted.lastId)!;
  return { user, recoveryCode };
}

export function httpError(status: number, message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

function attemptKey(ip: string, ident: string): string {
  return `${ip}|${ident.toLowerCase()}`;
}

export function assertNotLocked(ip: string, ident: string): void {
  const row = one<{ failures: number; locked_until: string | null }>(
    "SELECT failures, locked_until FROM login_attempts WHERE key = ?",
    attemptKey(ip, ident),
  );
  if (row?.locked_until && Date.parse(row.locked_until) > Date.now()) {
    const mins = Math.ceil((Date.parse(row.locked_until) - Date.now()) / 60000);
    throw httpError(429, `Muitas tentativas. Tente novamente em ${mins} min.`);
  }
}

export function recordFailure(ip: string, ident: string): void {
  const key = attemptKey(ip, ident);
  const row = one<{ failures: number }>("SELECT failures FROM login_attempts WHERE key = ?", key);
  const failures = (row?.failures ?? 0) + 1;
  const locked = failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MS).toISOString() : null;
  if (row) {
    run(
      "UPDATE login_attempts SET failures = ?, locked_until = ?, updated_at = ? WHERE key = ?",
      failures,
      locked,
      nowIso(),
      key,
    );
  } else {
    run(
      "INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES (?, ?, ?, ?)",
      key,
      failures,
      locked,
      nowIso(),
    );
  }
}

export function clearFailures(ip: string, ident: string): void {
  run("DELETE FROM login_attempts WHERE key = ?", attemptKey(ip, ident));
}

export function findByIdentifier(ident: string): UserRow | undefined {
  const parsed = parseIdentifier(ident);
  if (!parsed) return undefined;
  if (parsed.kind === "id") return one<UserRow>("SELECT * FROM users WHERE public_id = ?", parsed.value);
  return one<UserRow>("SELECT * FROM users WHERE lower(username) = ?", parsed.value);
}

export function verifyPassword(user: UserRow | undefined, password: string): boolean {
  const hash = user?.password_hash ?? DUMMY_HASH;
  const ok = bcrypt.compareSync(password, hash);
  return Boolean(user) && ok;
}

export function startSession(userId: number, res: Response, secure = false): void {
  const token = crypto.randomBytes(32).toString("hex");
  const created = nowIso();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  run("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", token, userId, created, expires);
  res.cookie("rc_session", token, { ...sessionCookie(secure), maxAge: SESSION_DAYS * 86400000 });
  run("UPDATE users SET last_seen = ? WHERE id = ?", created, userId);
}

export function destroySession(req: Request, res: Response): void {
  const token = req.cookies?.rc_session;
  if (typeof token === "string") run("DELETE FROM sessions WHERE token = ?", token);
  res.clearCookie("rc_session", sessionCookie(req.secure));
}

export function userFromRequest(req: Request): UserRow | undefined {
  const token = req.cookies?.rc_session;
  if (typeof token !== "string" || token.length < 32) return undefined;
  const session = one<{ user_id: number; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
    token,
  );
  if (!session) return undefined;
  if (Date.parse(session.expires_at) < Date.now()) {
    run("DELETE FROM sessions WHERE token = ?", token);
    return undefined;
  }
  return one<UserRow>("SELECT * FROM users WHERE id = ?", session.user_id);
}

export function requireUser(req: Request, _res: Response, next: NextFunction): void {
  const user = userFromRequest(req);
  if (!user) {
    next(httpError(401, "Entre na sua conta para continuar."));
    return;
  }
  req.user = user;
  next();
}

export function ratingsFor(userId: number): PublicUser["ratings"] {
  const rows = many<{ pool: string; rating: number; peak: number; games: number }>(
    "SELECT pool, rating, peak, games FROM ratings WHERE user_id = ?",
    userId,
  );
  const out: PublicUser["ratings"] = {};
  for (const pool of pools) {
    const row = rows.find((item) => item.pool === pool);
    out[pool] = { rating: row?.rating ?? 1200, peak: row?.peak ?? 1200, games: row?.games ?? 0 };
  }
  return out;
}

export function toPublic(user: UserRow): PublicUser {
  const decided = user.wins + user.losses + user.draws;
  return {
    id: user.id,
    publicId: user.public_id,
    username: user.username,
    displayName: user.display_name,
    avatar: safeAvatar(user.avatar),
    bio: user.bio,
    createdAt: user.created_at,
    games: user.games,
    wins: user.wins,
    losses: user.losses,
    draws: user.draws,
    winRate: decided ? Math.round((user.wins / decided) * 1000) / 10 : 0,
    ratings: ratingsFor(user.id),
  };
}

export function safeAvatar(avatar: string | null): string | null {
  if (!avatar) return null;
  if (/^(crown|rook|knight|queen|bishop|pawn|lion|star)$/.test(avatar)) return avatar;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar) && avatar.length < 260_000) {
    return avatar;
  }
  return null;
}

export function changePassword(user: UserRow, current: string, next: string): void {
  if (!bcrypt.compareSync(current, user.password_hash)) {
    throw httpError(403, "A senha atual não confere.");
  }
  if (!validPassword(next)) throw httpError(400, "A nova senha precisa ter entre 8 e 72 caracteres.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(next, 12), user.id);
}

export function recoverPassword(ident: string, recoveryCode: string, next: string): void {
  const user = findByIdentifier(ident);
  const code = recoveryCode.trim().toUpperCase();
  const hash = user?.recovery_hash ?? DUMMY_HASH;
  const ok = bcrypt.compareSync(code, hash);
  if (!user || !ok) throw httpError(403, "Usuário, ID ou código de recuperação inválido.");
  if (!validPassword(next)) throw httpError(400, "A nova senha precisa ter entre 8 e 72 caracteres.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", bcrypt.hashSync(next, 12), user.id);
  run("DELETE FROM sessions WHERE user_id = ?", user.id);
}

export function rotateRecovery(user: UserRow, currentPassword: string): string {
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    throw httpError(403, "A senha atual não confere.");
  }
  const recoveryCode = makeRecoveryCode();
  run("UPDATE users SET recovery_hash = ? WHERE id = ?", bcrypt.hashSync(recoveryCode, 10), user.id);
  return recoveryCode;
}

export function renameUser(user: UserRow, username: string): void {
  const next = normalizeUsername(username);
  if (!validUsername(next)) {
    throw httpError(400, "O usuário deve ter de 3 a 16 caracteres: letras, números ou _.");
  }
  if (usernameKey(next) === usernameKey(user.username)) {
    throw httpError(400, "Esse já é o seu usuário.");
  }
  if (user.username_changed_at) {
    const allowedAt = Date.parse(user.username_changed_at) + USERNAME_COOLDOWN_MS;
    if (allowedAt > Date.now()) {
      throw httpError(429, `Você poderá alterar o usuário em ${new Date(allowedAt).toLocaleDateString("pt-BR")}.`);
    }
  }
  if (one("SELECT id FROM users WHERE lower(username) = ? AND id != ?", usernameKey(next), user.id)) {
    throw httpError(409, "Esse nome de usuário já está em uso.");
  }
  run("UPDATE users SET username = ?, username_changed_at = ? WHERE id = ?", next, nowIso(), user.id);
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export function touch(userId: number): void {
  run("UPDATE users SET last_seen = ? WHERE id = ?", nowIso(), userId);
}

void db;
