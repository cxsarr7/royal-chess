const base = "http://127.0.0.1:8787";

function client() {
  const jar = new Map();
  return async function call(path, body, method = "POST") {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "RoyalChess",
        cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const data = await response.json();
    return { status: response.status, data };
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const stamp = Date.now().toString().slice(-6);
const white = client();
const black = client();
const registered = await white("/api/auth/register", {
  username: `W${stamp}`,
  displayName: "Brancas",
  password: "senha-forte",
  confirm: "senha-forte",
});
assert(registered.status === 201, "cadastro " + registered.data.error);
assert(/^RC\d{5}$/.test(registered.data.user.publicId), "id " + registered.data.user.publicId);
const code = registered.data.recoveryCode;
const dup = await white("/api/auth/register", {
  username: `W${stamp}`,
  password: "senha-forte",
  confirm: "senha-forte",
});
assert(dup.status === 409, "duplicado");

const bad = await client()("/api/auth/login", { identifier: `W${stamp}`, password: "errada" });
assert(bad.status === 401, "senha errada");
const byId = await client()("/api/auth/login", { identifier: registered.data.user.publicId, password: "senha-forte" });
assert(byId.status === 200, "login por id");

const other = await black("/api/auth/register", {
  username: `B${stamp}`,
  displayName: "Pretas",
  password: "senha-forte",
  confirm: "senha-forte",
});
assert(other.status === 201, "cadastro 2");

const invite = await white("/api/games/invite", { preset: "5+0", rated: true, color: "white" });
assert(invite.status === 201 && invite.data.game.code, "sala");
const joined = await black("/api/games/join", { code: invite.data.game.code });
assert(joined.data.game.status === "active", "sala ativa");
const gameId = joined.data.game.id;

const line = [
  ["e2", "e4"],
  ["e7", "e5"],
  ["g1", "f3"],
  ["b8", "c6"],
  ["f1", "c4"],
  ["g8", "f6"],
  ["d2", "d3"],
  ["f8", "c5"],
  ["e1", "g1"],
  ["e8", "g8"],
];
let fen = "";
for (let i = 0; i < line.length; i++) {
  const actor = i % 2 === 0 ? white : black;
  const moved = await actor(`/api/games/${gameId}/move`, { from: line[i][0], to: line[i][1] });
  assert(moved.status === 200, `lance ${i} ${moved.data.error}`);
  fen = moved.data.game.fen;
}
assert(fen.includes("K") && fen.includes("k"), "roque refletido no FEN");
const illegal = await white(`/api/games/${gameId}/move`, { from: "a2", to: "a5" });
assert(illegal.status === 400, "lance ilegal");

const ep = await white("/api/games/invite", { preset: "5+0", rated: false, color: "white" });
const epJoin = await black("/api/games/join", { code: ep.data.game.code });
const epId = epJoin.data.game.id;
const epLine = [["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["d7", "d5"], ["e5", "d6"]];
for (let i = 0; i < epLine.length; i++) {
  const actor = i % 2 === 0 ? white : black;
  const moved = await actor(`/api/games/${epId}/move`, { from: epLine[i][0], to: epLine[i][1] });
  assert(moved.status === 200, `ep ${i} ${moved.data.error}`);
  if (i === epLine.length - 1) assert(moved.data.game.moves.at(-1).san === "exd6", "en passant " + moved.data.game.moves.at(-1).san);
}

const mate = await white("/api/games/invite", { preset: "5+0", rated: true, color: "white" });
const mateJoin = await black("/api/games/join", { code: mate.data.game.code });
const mateId = mateJoin.data.game.id;
const mateLine = [["e2", "e4"], ["e7", "e5"], ["d1", "h5"], ["b8", "c6"], ["f1", "c4"], ["g8", "f6"], ["h5", "f7"]];
for (let i = 0; i < mateLine.length; i++) {
  const actor = i % 2 === 0 ? white : black;
  const moved = await actor(`/api/games/${mateId}/move`, { from: mateLine[i][0], to: mateLine[i][1] });
  assert(moved.status === 200, `mate ${i} ${moved.data.error}`);
  if (i === mateLine.length - 1) {
    assert(moved.data.game.status === "finished" && moved.data.game.result === "1-0", "xeque-mate");
    assert(moved.data.game.deltas.length === 2, "elo atualizado");
  }
}

const bot = await white("/api/games/bot", { preset: "3+2", level: "apprentice", style: "agressivo", color: "white" });
assert(bot.status === 201 && bot.data.game.status === "active", "bot");
const resigned = await white(`/api/games/${bot.data.game.id}/resign`, {});
assert(resigned.data.game.status === "aborted", "rendição precoce anulada " + resigned.data.game.status);

const friend = await white("/api/friends", { identifier: other.data.user.publicId });
assert(friend.status === 201, "pedido");
const incoming = await black("/api/friends", null, "GET");
assert(incoming.data.incoming.length === 1, "pedido visível");
await black(`/api/friends/${incoming.data.incoming[0].requestId}/accept`, {});
const message = await white(`/api/friends/${other.data.user.id}/messages`, { body: "Boa partida." });
assert(message.status === 201, "chat " + message.data.error);

const recovered = await client()("/api/auth/recover", {
  identifier: registered.data.user.publicId,
  recoveryCode: code,
  password: "nova-senha-forte",
});
assert(recovered.status === 200, "recuperação");
const relog = await client()("/api/auth/login", { identifier: `W${stamp}`, password: "nova-senha-forte" });
assert(relog.status === 200, "login após recuperação");

const overview = await client()("/api/overview", null, "GET");
assert(overview.data.players >= 2 && overview.data.games >= 1, "estatísticas reais");
console.log("ok", overview.data);
