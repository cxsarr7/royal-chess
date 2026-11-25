import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLive } from "../lib/live";
import { playMoveSound } from "../lib/sound";
import { START_FEN, type GameView, type Preferences } from "../lib/types";
import { POOL_LABEL, type Pool } from "../../shared/time";

const REASONS: Record<string, string> = {
  checkmate: "xeque-mate",
  stalemate: "afogamento",
  repetition: "repetição de posição",
  insufficient: "material insuficiente",
  draw: "empate pela regra",
  agreement: "acordo",
  resign: "rendição",
  timeout: "tempo esgotado",
  aborted: "anulada",
  declined: "recusada",
  cancelled: "cancelada",
};

function Clock({ ms, running, startedAt, offset }: { ms: number; running: boolean; startedAt: number | null; offset: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 100);
    return () => window.clearInterval(id);
  }, [running]);
  const remain = Math.max(0, ms - (running && startedAt ? Date.now() + offset - startedAt : 0));
  const total = Math.ceil(remain / 1000);
  const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}${remain < 20000 ? "." + Math.floor((remain % 1000) / 100) : ""}`;
  return <span className={`display text-3xl tabular-nums ${remain < 20000 && running ? "text-danger" : ""}`}>{text}</span>;
}

function SideCard({ side, ms, active, offset, startedAt }: { side: GameView["white"]; ms: number; active: boolean; offset: number; startedAt: number | null }) {
  if (!side) return <div className="card p-3 text-sm text-ivory/50">Aguardando jogador</div>;
  return (
    <div className={`card flex items-start justify-between gap-3 p-3 ${active ? "border-gold/50" : ""}`}>
      <div className="flex min-w-0 items-start gap-3">
        <Avatar avatar={side.avatar} name={side.name} />
        <div className="min-w-0">
          {side.publicId ? <Link to={`/perfil/${side.publicId}`} className="hover:text-gold-2">{side.name}</Link> : <p className="break-words">{side.name}</p>}
          <p className="muted text-xs">
            {side.bot ? `${side.style}${side.rating ? ` · ${side.rating}` : ""}` : `@${side.username} · #${side.publicId}`}
            {!side.bot && side.rating ? ` · ${side.rating}` : ""}
          </p>
          {side.bot && side.bio ? <p className="muted mt-1 text-xs leading-relaxed break-words">{side.bio}</p> : null}
        </div>
      </div>
      <Clock ms={ms} running={active} startedAt={startedAt} offset={offset} />
    </div>
  );
}

export function Game() {
  const { id } = useParams();
  const { user, preferences } = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState("");
  const [ply, setPly] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const prefs: Preferences = preferences ?? {
    theme: "royal", pieces: "royal", coordinates: true, sounds: true, animations: true, allowMessages: true, allowInvites: true,
  };

  async function load() {
    const data = await api<{ game: GameView }>(`/api/games/${id}`);
    setGame(data.game);
  }

  useEffect(() => {
    load().catch((reason: Error) => setError(reason.message));
  }, [id]);

  useLive((message) => {
    if (message.type === "game" && message.game && (message.game as GameView).id === Number(id)) {
      setGame(message.game as GameView);
    }
  });

  useEffect(() => {
    if (!game || game.status !== "active") return;
    const timer = window.setInterval(() => {
      api<{ game: GameView }>(`/api/games/${id}`).then((data) => setGame(data.game)).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [game?.status, id]);

  const heard = useRef(false);
  useEffect(() => {
    if (!game || !prefs.sounds) return;
    if (!heard.current) {
      heard.current = true;
      return;
    }
    const last = game.moves[game.moves.length - 1];
    if (!last) return;
    if (game.status !== "active") playMoveSound("end");
    else if (last.san.includes("+") || last.san.includes("#")) playMoveSound("check");
    else if (last.san.includes("x")) playMoveSound("capture");
    else playMoveSound("move");
  }, [game?.moves.length, game?.status]);

  if (error) return <p className="text-danger" role="alert">{error}</p>;
  if (!game) return <p className="muted">Carregando partida…</p>;

  const positions = [START_FEN, ...game.moves.map((move) => move.fen)];
  const index = ply === null ? positions.length - 1 : ply;
  const live = index === positions.length - 1;
  const fen = positions[index] ?? game.fen;
  const previous = index > 0 ? game.moves[index - 1] : null;
  const offset = game.serverNow - Date.now();
  const turn = game.moves.length % 2 === 0 ? "w" : "b";
  const interactive = game.status === "active" && live && game.yourColor === turn;
  const baseOrientation = game.yourColor === "b" ? "black" : "white";
  const orientation = flipped ? (baseOrientation === "white" ? "black" : "white") : baseOrientation;
  const youWin = Boolean(game.yourColor && ((game.result === "1-0" && game.yourColor === "w") || (game.result === "0-1" && game.yourColor === "b")));
  const youDraw = game.result === "1/2-1/2";
  const resultTitle = game.status === "aborted" ? "Partida anulada" : youDraw ? "Empate" : youWin ? "Vitória" : game.yourColor && game.result ? "Derrota" : (game.result ?? "Encerrada");
  const checked = game.status === "active" && live && new Chess(fen).inCheck();

  async function act(path: string, body?: unknown) {
    setError("");
    try {
      const data = await api<{ game?: GameView }>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      if (data.game) setGame(data.game);
      else await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ação não concluída.");
    }
  }

  return (
    <div className="game-layout">
      <div>
        {checked ? <p className="mb-2 text-sm text-danger">Xeque</p> : null}
        <Board
          fen={fen}
          orientation={orientation}
          interactive={interactive}
          playColor={game.yourColor ?? "both"}
          theme={prefs.theme}
          pieces={prefs.pieces}
          coordinates={prefs.coordinates}
          animate={prefs.animations && live}
          lastMove={previous ? { from: previous.from, to: previous.to } : null}
          onMove={(from, to, promotion) => act(`/api/games/${game.id}/move`, { from, to, promotion })}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setPly(0)} aria-label="Início">Início</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly(Math.max(0, index - 1))} aria-label="Lance anterior">Anterior</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly(index + 1 >= positions.length ? null : index + 1)} aria-label="Lance seguinte">Seguinte</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly(null)}>Ao vivo</button>
          <button type="button" className="btn btn-ghost" onClick={() => setFlipped((value) => !value)}>Virar tabuleiro</button>
          {!live ? <span className="text-sm text-gold-2">Revendo o lance {index}</span> : null}
        </div>
      </div>
      <div className="space-y-3">
        <SideCard side={orientation === "white" ? game.black : game.white} ms={orientation === "white" ? game.blackMs : game.whiteMs} active={game.status === "active" && live && turn === (orientation === "white" ? "b" : "w")} offset={offset} startedAt={game.turnStartedAt} />
        <div className="card max-h-64 overflow-auto p-3 text-sm leading-7">
          {game.moves.length === 0 ? <p className="muted">Nenhum lance ainda.</p> : game.moves.map((move, moveIndex) => (
            <button key={`${move.san}-${moveIndex}`} type="button" className={`mr-2 ${index === moveIndex + 1 ? "text-gold-2" : ""}`} onClick={() => setPly(moveIndex + 1)}>
              {moveIndex % 2 === 0 ? `${moveIndex / 2 + 1}. ` : ""}{move.san}
            </button>
          ))}
        </div>
        <SideCard side={orientation === "white" ? game.white : game.black} ms={orientation === "white" ? game.whiteMs : game.blackMs} active={game.status === "active" && live && turn === (orientation === "white" ? "w" : "b")} offset={offset} startedAt={game.turnStartedAt} />
        <p className="muted text-xs">{POOL_LABEL[game.pool as Pool] ?? game.pool} · {game.rated ? "classificada" : "amistosa"} · {Math.round(game.baseMs / 60000)}+{Math.round(game.incMs / 1000)}</p>
        {game.status === "waiting" ? (
          <div className="card space-y-2 p-3 text-sm">
            <p>A sala está aberta.</p>
            {game.code ? <p className="display text-3xl text-gold-2">{game.code}</p> : null}
            {game.awaitingYou ? (
              <button type="button" className="btn btn-gold w-full" onClick={() => act(`/api/games/${game.id}/accept`)}>Aceitar convite</button>
            ) : null}
            <button type="button" className="btn btn-ghost w-full" onClick={() => { navigator.clipboard.writeText(`${location.origin}/jogar?sala=${game.code ?? ""}`); setCopied(true); }}>{copied ? "Link copiado" : "Copiar link da sala"}</button>
            <button type="button" className="btn btn-danger w-full" onClick={() => act(`/api/games/${game.id}/abort`)}>Cancelar</button>
          </div>
        ) : null}
        {game.status === "active" && game.yourColor ? (
          <div className="grid grid-cols-2 gap-2">
            {game.moves.length < 2 ? <button type="button" className="btn btn-ghost col-span-2" onClick={() => act(`/api/games/${game.id}/abort`)}>Anular</button> : null}
            {confirmResign ? (
              <button type="button" className="btn btn-danger col-span-2" onClick={() => act(`/api/games/${game.id}/resign`)}>Confirmar abandono</button>
            ) : (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmResign(true)}>Abandonar</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => act(`/api/games/${game.id}/draw`, { accept: Boolean(game.drawOfferedBy && game.drawOfferedBy !== user?.id) })}>
              {game.drawOfferedBy && game.drawOfferedBy !== user?.id ? "Aceitar empate" : game.drawOfferedBy === user?.id ? "Cancelar oferta" : "Oferecer empate"}
            </button>
          </div>
        ) : null}
        {game.status === "finished" || game.status === "aborted" ? (
          <div className={`card p-4 text-sm ${youWin ? "border-gold" : ""}`}>
            <p className="kicker">Resultado</p>
            <p className="display text-4xl">{resultTitle}</p>
            <p className="muted">{game.reason ? REASONS[game.reason] ?? game.reason : game.result}</p>
            {game.deltas.map((delta) => <p key={delta.userId} className="mt-1">{delta.delta > 0 ? "+" : ""}{delta.delta} → {delta.rating}</p>)}
            <Link className="mt-3 inline-block text-gold-2" to={`/analisar/${game.id}`}>Analisar partida</Link>
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </div>
  );
}
