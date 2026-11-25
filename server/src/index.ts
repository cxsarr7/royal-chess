import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";
import { clampTime, TIME_PRESETS, type Pool } from "../../shared/time.ts";
import { parsePrefs, type Preferences } from "../../shared/prefs.ts";
import {
  assertNotLocked,
  changePassword,
  clearFailures,
  createUser,
  destroySession,
  findByIdentifier,
  httpError,
  recordFailure,
  recoverPassword,
  renameUser,
  requireUser,
  rotateRecovery,
  safeAvatar,
  startSession,
  toPublic,
  touch,
  userFromRequest,
  validDisplayName,
  validPassword,
  validUsername,
  verifyPassword,
} from "./auth.ts";
import { leaderboard, ratingHistory, type PoolName } from "./elo.ts";
import { one, run, type UserRow } from "./db.ts";
import { challenges, listFor, recent } from "./achievements.ts";
import { analyzeGame } from "./analysis.ts";
import {
  abortGame,
  acceptInvite,
  cancelSeek,
  createBotGame,
  createInvite,
  declineInvite,
  enqueueSeek,
  getGame,
  joinByCode,
  listGames,
  offerDraw,
  overview,
  pendingInvites,
  resign,
  setGameHooks,
  tickClocks,
  applyMove,
} from "./games.ts";
import { friendState, listMessages, removeFriend, requestFriend, respondFriend, searchPlayers, sendMessage, setSocialHooks } from "./social.ts";
import { createTournament, detail, joinTournament, listTournaments, startTournament } from "./tournaments.ts";
import { canonicalRedirect, publicUrl } from "./public-url.ts";

const app = express();
app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(express.json({ limit: "300kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const target = canonicalRedirect(req.protocol, req.get("host") ?? "", req.originalUrl);
  if (target) {
    res.redirect(308, target);
    return;
  }
  const { canonical } = publicUrl();
  if (req.secure && canonical && `${req.protocol}://${(req.get("host") ?? "").toLowerCase()}` === canonical) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  const origin = req.get("origin");
  const allowed = publicUrl();
  const known = [allowed.canonical, ...allowed.aliases].filter((item): item is string => Boolean(item));
  if (origin && known.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
  }
  next();
});

const hits = new Map<string, number[]>();
function limit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function ipOf(req: Request): string {
  return req.ip || req.socket.remoteAddress || "local";
}

function asyncRoute(fn: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function readTime(body: { preset?: string; baseMin?: number; incSec?: number }) {
  if (body.preset) {
    const preset = TIME_PRESETS.find((item) => item.id === body.preset);
    if (!preset) throw httpError(400, "Ritmo de jogo inválido.");
    return { baseMs: preset.baseMs, incMs: preset.incMs };
  }
  if (typeof body.baseMin !== "number" || typeof body.incSec !== "number") {
    throw httpError(400, "Informe um ritmo de jogo.");
  }
  return clampTime(body.baseMin, body.incSec);
}

const pools = new Set(["bullet", "blitz", "rapid", "classical"]);
function readPool(value: unknown): PoolName {
  return typeof value === "string" && pools.has(value) ? (value as Pool) : "blitz";
}

const sockets = new Map<number, Set<import("ws").WebSocket>>();
function isOnline(userId: number): boolean {
  return (sockets.get(userId)?.size ?? 0) > 0;
}
function notify(userId: number, payload: unknown): void {
  const packet = JSON.stringify(payload);
  for (const socket of sockets.get(userId) ?? []) {
    if (socket.readyState === socket.OPEN) socket.send(packet);
  }
}
setGameHooks({ notify, online: isOnline });
setSocialHooks({ notify, online: isOnline });

app.get("/api/overview", (_req, res) => {
  res.json({ ...overview(), leaderboard: leaderboard("blitz", "all").slice(0, 8) });
});

app.get("/api/leaderboard", (req, res) => {
  const pool = readPool(req.query.pool);
  const period = req.query.period === "week" || req.query.period === "month" ? req.query.period : "all";
  res.json({ pool, period, rows: leaderboard(pool, period) });
});

app.get("/api/users/available", (req, res) => {
  if (!limit(`name:${ipOf(req)}`, 40, 60_000)) throw httpError(429, "Muitas consultas. Aguarde um pouco.");
  const username = String(req.query.username ?? "");
  if (!validUsername(username)) {
    res.json({ available: false, reason: "Use de 3 a 16 letras, números ou _." });
    return;
  }
  const taken = one("SELECT id FROM users WHERE lower(username) = ?", username.toLowerCase());
  res.json({ available: !taken });
});

app.post("/api/auth/register", (req, res) => {
  if (!limit(`reg:${ipOf(req)}`, 8, 60 * 60_000)) throw httpError(429, "Muitos cadastros a partir desta rede. Tente mais tarde.");
  const { username, password, confirm, displayName } = req.body ?? {};
  if (password !== confirm) throw httpError(400, "A confirmação de senha não confere.");
  const { user, recoveryCode } = createUser({
    username: String(username ?? ""),
    password: String(password ?? ""),
    displayName: String(displayName || username || ""),
  });
  startSession(user.id, res, req.secure);
  res.status(201).json({ user: toPublic(user), recoveryCode });
});

app.post("/api/auth/login", (req, res) => {
  const identifier = String(req.body?.identifier ?? "");
  const password = String(req.body?.password ?? "");
  if (!limit(`login:${ipOf(req)}`, 30, 15 * 60_000)) throw httpError(429, "Muitas tentativas. Aguarde alguns minutos.");
  assertNotLocked(ipOf(req), identifier || "vazio");
  const user = findByIdentifier(identifier);
  if (!verifyPassword(user, password) || !user) {
    recordFailure(ipOf(req), identifier || "vazio");
    throw httpError(401, "Usuário, ID ou senha inválidos.");
  }
  clearFailures(ipOf(req), identifier);
  startSession(user.id, res, req.secure);
  res.json({ user: toPublic(one<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!) });
});

app.post("/api/auth/logout", (req, res) => {
  const user = userFromRequest(req);
  if (user) cancelSeek(user.id);
  destroySession(req, res);
  res.json({ ok: true });
});

app.post("/api/auth/recover", (req, res) => {
  if (!limit(`recover:${ipOf(req)}`, 10, 60 * 60_000)) throw httpError(429, "Muitas tentativas de recuperação.");
  recoverPassword(String(req.body?.identifier ?? ""), String(req.body?.recoveryCode ?? ""), String(req.body?.password ?? ""));
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const user = userFromRequest(req);
  if (!user) {
    res.json({ user: null });
    return;
  }
  touch(user.id);
  res.json({ user: toPublic(user), preferences: parsePrefs(JSON.parse(user.preferences || "{}")) });
});

app.post("/api/auth/password", requireUser, (req, res) => {
  changePassword(req.user!, String(req.body?.current ?? ""), String(req.body?.next ?? ""));
  res.json({ ok: true });
});

app.post("/api/auth/recovery-code", requireUser, (req, res) => {
  const recoveryCode = rotateRecovery(req.user!, String(req.body?.current ?? ""));
  res.json({ recoveryCode });
});

app.patch("/api/me", requireUser, (req, res) => {
  const user = req.user!;
  const body = req.body ?? {};
  if (typeof body.username === "string") renameUser(user, body.username);
  if (typeof body.displayName === "string") {
    if (!validDisplayName(body.displayName)) throw httpError(400, "O nome de exibição deve ter entre 2 e 24 caracteres.");
    run("UPDATE users SET display_name = ? WHERE id = ?", body.displayName.trim(), user.id);
  }
  if (typeof body.bio === "string") {
    const bio = body.bio.trim().slice(0, 160);
    run("UPDATE users SET bio = ? WHERE id = ?", bio, user.id);
  }
  if (body.avatar === null || typeof body.avatar === "string") {
    const avatar = safeAvatar(body.avatar);
    if (body.avatar && !avatar) throw httpError(400, "Use um dos emblemas ou uma imagem PNG, JPEG ou WebP de até 200 KB.");
    run("UPDATE users SET avatar = ? WHERE id = ?", avatar, user.id);
  }
  if (body.preferences && typeof body.preferences === "object") {
    const current = parsePrefs(JSON.parse(one<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!.preferences || "{}"));
    const next: Preferences = parsePrefs({ ...current, ...body.preferences });
    run("UPDATE users SET preferences = ? WHERE id = ?", JSON.stringify(next), user.id);
  }
  const fresh = one<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!;
  res.json({ user: toPublic(fresh), preferences: parsePrefs(JSON.parse(fresh.preferences || "{}")) });
});

app.get("/api/me/dashboard", requireUser, (req, res) => {
  const user = req.user!;
  const pool = readPool(req.query.pool);
  const friends = friendState(user.id);
  res.json({
    user: toPublic(user),
    preferences: parsePrefs(JSON.parse(user.preferences || "{}")),
    history: ratingHistory(user.id, pool),
    games: listGames(user.id, 6),
    invites: pendingInvites(user.id),
    friendsOnline: friends.friends.filter((item) => item.online),
    incoming: friends.incoming.length,
    tournaments: listTournaments(user.id).filter((item) => item.status !== "finished").slice(0, 4),
    achievements: recent(user.id),
    challenges: challenges(user.id),
  });
});

app.get("/api/me/games", requireUser, (req, res) => {
  res.json({ games: listGames(req.user!.id, 40) });
});

app.get("/api/users/search", requireUser, (req, res) => {
  if (!limit(`search:${req.user!.id}`, 40, 60_000)) throw httpError(429, "Muitas buscas. Aguarde um instante.");
  res.json({ players: searchPlayers(String(req.query.q ?? ""), req.user!.id) });
});

app.get("/api/users/:publicId", (req, res) => {
  const user = one<UserRow>("SELECT * FROM users WHERE public_id = ?", req.params.publicId.toUpperCase());
  if (!user) throw httpError(404, "Jogador não encontrado.");
  const viewer = userFromRequest(req);
  res.json({
    user: toPublic(user),
    achievements: listFor(user.id),
    games: listGames(user.id, 15).filter((game) => game.status === "finished" || viewer?.id === user.id),
    online: isOnline(user.id),
  });
});

app.get("/api/compare", (req, res) => {
  const load = (publicId: string) => {
    const user = one<UserRow>("SELECT * FROM users WHERE public_id = ?", publicId.replace(/^#/, "").toUpperCase());
    if (!user) throw httpError(404, "Jogador não encontrado.");
    return toPublic(user);
  };
  res.json({ a: load(String(req.query.a ?? "")), b: load(String(req.query.b ?? "")) });
});

app.post("/api/games/bot", requireUser, asyncRoute(async (req, res) => {
  const time = readTime(req.body ?? {});
  const color = req.body?.color === "black" || req.body?.color === "random" ? req.body.color : "white";
  const game = await createBotGame(req.user!, {
    level: String(req.body?.level ?? "club"),
    style: String(req.body?.style ?? "equilibrado"),
    color,
    ...time,
  });
  res.status(201).json({ game });
}));

app.post("/api/games/invite", requireUser, (req, res) => {
  const time = readTime(req.body ?? {});
  const color = req.body?.color === "black" || req.body?.color === "random" ? req.body.color : "white";
  const game = createInvite(req.user!, {
    ...time,
    rated: Boolean(req.body?.rated),
    friendId: typeof req.body?.friendId === "number" ? req.body.friendId : undefined,
    color,
  });
  res.status(201).json({ game });
});

app.post("/api/games/join", requireUser, (req, res) => {
  res.json({ game: joinByCode(req.user!, String(req.body?.code ?? "")) });
});

app.post("/api/games/seek", requireUser, (req, res) => {
  const time = readTime(req.body ?? {});
  const result = enqueueSeek(req.user!, { ...time, rated: req.body?.rated !== false });
  res.json(result);
});

app.delete("/api/games/seek", requireUser, (req, res) => {
  cancelSeek(req.user!.id);
  res.json({ ok: true });
});

app.get("/api/games/invites", requireUser, (req, res) => {
  res.json({ invites: pendingInvites(req.user!.id) });
});

app.get("/api/games/:id", (req, res) => {
  const viewer = userFromRequest(req);
  res.json({ game: getGame(Number(req.params.id), viewer) });
});

app.post("/api/games/:id/move", requireUser, asyncRoute(async (req, res) => {
  const game = await applyMove(
    Number(req.params.id),
    req.user!,
    String(req.body?.from ?? ""),
    String(req.body?.to ?? ""),
    typeof req.body?.promotion === "string" ? req.body.promotion : undefined,
  );
  res.json({ game });
}));

app.post("/api/games/:id/resign", requireUser, (req, res) => {
  res.json({ game: resign(req.user!, Number(req.params.id)) });
});

app.post("/api/games/:id/draw", requireUser, (req, res) => {
  res.json({ game: offerDraw(req.user!, Number(req.params.id), Boolean(req.body?.accept)) });
});

app.post("/api/games/:id/abort", requireUser, (req, res) => {
  res.json({ game: abortGame(req.user!, Number(req.params.id)) });
});

app.post("/api/games/:id/accept", requireUser, (req, res) => {
  res.json({ game: acceptInvite(req.user!, Number(req.params.id)) });
});

app.post("/api/games/:id/decline", requireUser, (req, res) => {
  declineInvite(req.user!, Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/games/:id/analyze", requireUser, asyncRoute(async (req, res) => {
  const analysis = await analyzeGame(req.user!, Number(req.params.id));
  res.json({ analysis });
}));

app.get("/api/friends", requireUser, (req, res) => {
  res.json(friendState(req.user!.id));
});

app.post("/api/friends", requireUser, (req, res) => {
  res.status(201).json(requestFriend(req.user!, String(req.body?.identifier ?? "")));
});

app.post("/api/friends/:id/accept", requireUser, (req, res) => {
  respondFriend(req.user!, Number(req.params.id), true);
  res.json(friendState(req.user!.id));
});

app.post("/api/friends/:id/decline", requireUser, (req, res) => {
  respondFriend(req.user!, Number(req.params.id), false);
  res.json(friendState(req.user!.id));
});

app.delete("/api/friends/:id", requireUser, (req, res) => {
  removeFriend(req.user!, Number(req.params.id));
  res.json(friendState(req.user!.id));
});

app.get("/api/friends/:id/messages", requireUser, (req, res) => {
  res.json({ messages: listMessages(req.user!.id, Number(req.params.id)) });
});

app.post("/api/friends/:id/messages", requireUser, (req, res) => {
  res.status(201).json({ message: sendMessage(req.user!, Number(req.params.id), String(req.body?.body ?? "")) });
});

app.get("/api/tournaments", (req, res) => {
  const viewer = userFromRequest(req);
  res.json({ tournaments: listTournaments(viewer?.id) });
});

app.post("/api/tournaments", requireUser, (req, res) => {
  const time = readTime(req.body ?? {});
  const tournament = createTournament(req.user!, {
    name: String(req.body?.name ?? ""),
    visibility: req.body?.visibility === "private" ? "private" : "public",
    rounds: Number(req.body?.rounds ?? 3),
    maxPlayers: Number(req.body?.maxPlayers ?? 8),
    ...time,
  });
  res.status(201).json({ tournament });
});

app.get("/api/tournaments/:id", (req, res) => {
  res.json({ tournament: detail(Number(req.params.id), userFromRequest(req)) });
});

app.post("/api/tournaments/:id/join", requireUser, (req, res) => {
  res.json({ tournament: joinTournament(req.user!, Number(req.params.id), req.body?.code) });
});

app.post("/api/tournaments/:id/start", requireUser, (req, res) => {
  res.json({ tournament: startTournament(req.user!, Number(req.params.id)) });
});

app.get("/api/achievements", requireUser, (req, res) => {
  res.json({ achievements: listFor(req.user!.id), challenges: challenges(req.user!.id) });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dist = path.join(root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? "Erro interno." : error.message });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket, req) => {
  const header = req.headers.cookie ?? "";
  const token = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("rc_session="))
    ?.slice("rc_session=".length);
  if (!token) {
    socket.close();
    return;
  }
  const session = one<{ user_id: number; expires_at: string }>(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?",
    decodeURIComponent(token),
  );
  if (!session || Date.parse(session.expires_at) < Date.now()) {
    socket.close();
    return;
  }
  const userId = session.user_id;
  const set = sockets.get(userId) ?? new Set();
  set.add(socket);
  sockets.set(userId, set);
  touch(userId);
  const friends = friendState(userId).friends.map((friend) => friend.id);
  for (const friendId of friends) notify(friendId, { type: "presence", userId, online: true });
  socket.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as { type?: string };
      if (msg.type === "ping") touch(userId);
    } catch {
      /* ignore malformed frames */
    }
  });
  socket.on("close", () => {
    set.delete(socket);
    if (set.size === 0) {
      sockets.delete(userId);
      for (const friendId of friends) notify(friendId, { type: "presence", userId, online: false });
    }
  });
});

setInterval(tickClocks, 400);

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
publicUrl();
server.listen(port, host, () => {
  const canonical = publicUrl().canonical;
  console.log(`Royal Chess em http://${host}:${port}${canonical ? ` · endereço canônico ${canonical}` : ""}`);
});

void validPassword;
