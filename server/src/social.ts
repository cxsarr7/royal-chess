import { parsePrefs } from "../../shared/prefs.ts";
import { httpError, safeAvatar, usernameKey, validUsername, type PublicUser } from "./auth.ts";
import { many, nowIso, one, run, type UserRow } from "./db.ts";
import { unlock } from "./achievements.ts";

let online: (id: number) => boolean = () => false;
let notify: (id: number, payload: unknown) => void = () => {};
const bursts = new Map<number, number[]>();

export function setSocialHooks(hooks: { online: (id: number) => boolean; notify: (id: number, payload: unknown) => void }): void {
  online = hooks.online;
  notify = hooks.notify;
}

function prefsOf(user: UserRow) {
  return parsePrefs(JSON.parse(user.preferences || "{}"));
}

function card(user: UserRow) {
  return {
    id: user.id,
    publicId: user.public_id,
    username: user.username,
    displayName: user.display_name,
    avatar: safeAvatar(user.avatar),
    online: online(user.id),
  };
}

function relation(a: number, b: number) {
  return one<{ id: number; requester_id: number; addressee_id: number; status: string }>(
    `SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    a,
    b,
    b,
    a,
  );
}

export function searchPlayers(query: string, selfId: number) {
  const q = query.trim();
  if (q.length < 2) return [];
  const id = q.replace(/^#/, "").toUpperCase();
  if (/^RC\d{5}$/.test(id)) {
    return many<UserRow>("SELECT * FROM users WHERE public_id = ? AND id != ? LIMIT 5", id, selfId).map(card);
  }
  if (!validUsername(q) && q.length < 2) return [];
  return many<UserRow>(
    "SELECT * FROM users WHERE id != ? AND lower(username) LIKE ? ORDER BY username LIMIT 8",
    selfId,
    `${usernameKey(q)}%`,
  ).map(card);
}

export function requestFriend(user: UserRow, ident: string): { status: string } {
  const key = ident.trim();
  const id = key.replace(/^#/, "").toUpperCase();
  const other = /^RC\d{5}$/.test(id)
    ? one<UserRow>("SELECT * FROM users WHERE public_id = ?", id)
    : one<UserRow>("SELECT * FROM users WHERE lower(username) = ?", usernameKey(key));
  if (!other) throw httpError(404, "Jogador não encontrado.");
  if (other.id === user.id) throw httpError(400, "Você não pode adicionar a si mesmo.");
  const existing = relation(user.id, other.id);
  if (existing?.status === "accepted") throw httpError(409, "Vocês já são amigos.");
  if (existing?.status === "pending" && existing.requester_id === user.id) {
    throw httpError(409, "O pedido já foi enviado.");
  }
  if (existing?.status === "pending" && existing.addressee_id === user.id) {
    run("UPDATE friendships SET status = 'accepted' WHERE id = ?", existing.id);
    unlock(user.id, "first_friend");
    unlock(other.id, "first_friend");
    notify(other.id, { type: "friends" });
    return { status: "accepted" };
  }
  run(
    "INSERT INTO friendships (requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)",
    user.id,
    other.id,
    nowIso(),
  );
  notify(other.id, { type: "friends" });
  return { status: "pending" };
}

export function respondFriend(user: UserRow, requestId: number, accept: boolean): void {
  const row = one<{ id: number; requester_id: number; addressee_id: number; status: string }>(
    "SELECT * FROM friendships WHERE id = ?",
    requestId,
  );
  if (!row || row.addressee_id !== user.id || row.status !== "pending") throw httpError(404, "Pedido não encontrado.");
  if (!accept) {
    run("DELETE FROM friendships WHERE id = ?", row.id);
    return;
  }
  run("UPDATE friendships SET status = 'accepted' WHERE id = ?", row.id);
  unlock(user.id, "first_friend");
  unlock(row.requester_id, "first_friend");
  notify(row.requester_id, { type: "friends" });
}

export function removeFriend(user: UserRow, otherId: number): void {
  const row = relation(user.id, otherId);
  if (!row) throw httpError(404, "Amizade não encontrada.");
  run("DELETE FROM friendships WHERE id = ?", row.id);
  const other = row.requester_id === user.id ? row.addressee_id : row.requester_id;
  notify(other, { type: "friends" });
}

export function friendState(userId: number) {
  const rows = many<{ id: number; requester_id: number; addressee_id: number; status: string; created_at: string }>(
    "SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ? ORDER BY id DESC",
    userId,
    userId,
  );
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const row of rows) {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const other = one<UserRow>("SELECT * FROM users WHERE id = ?", otherId);
    if (!other) continue;
    const item = { requestId: row.id, since: row.created_at, ...card(other) };
    if (row.status === "accepted") friends.push(item);
    else if (row.addressee_id === userId) incoming.push(item);
    else outgoing.push(item);
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  return { friends, incoming, outgoing };
}

export function sendMessage(user: UserRow, otherId: number, body: string): { id: number; body: string; createdAt: string; senderId: number } {
  const text = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (!text || text.length > 500) throw httpError(400, "A mensagem deve ter entre 1 e 500 caracteres.");
  const row = relation(user.id, otherId);
  if (!row || row.status !== "accepted") throw httpError(403, "O chat fica disponível só entre amigos.");
  const other = one<UserRow>("SELECT * FROM users WHERE id = ?", otherId);
  if (!other) throw httpError(404, "Jogador não encontrado.");
  if (!prefsOf(other).allowMessages) throw httpError(403, "Esse jogador desativou mensagens.");
  const now = Date.now();
  const recent = (bursts.get(user.id) ?? []).filter((stamp) => now - stamp < 10_000);
  if (recent.length >= 12) throw httpError(429, "Você está enviando mensagens rápido demais.");
  recent.push(now);
  bursts.set(user.id, recent);
  const inserted = run(
    "INSERT INTO messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)",
    user.id,
    otherId,
    text,
    nowIso(),
  );
  const message = { id: inserted.lastId, body: text, createdAt: nowIso(), senderId: user.id, recipientId: otherId };
  notify(otherId, { type: "message", message });
  return message;
}

export function listMessages(userId: number, otherId: number) {
  const row = relation(userId, otherId);
  if (!row || row.status !== "accepted") throw httpError(403, "O chat fica disponível só entre amigos.");
  run(
    "UPDATE messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL",
    nowIso(),
    userId,
    otherId,
  );
  return many<{ id: number; sender_id: number; body: string; created_at: string }>(
    `SELECT id, sender_id, body, created_at FROM messages
     WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
     ORDER BY id DESC LIMIT 80`,
    userId,
    otherId,
    otherId,
    userId,
  )
    .reverse()
    .map((item) => ({ id: item.id, senderId: item.sender_id, body: item.body, createdAt: item.created_at }));
}

export type { PublicUser };
