import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { POOL_LABEL, type Pool } from "../../shared/time";
import { Avatar } from "../components/Avatar";
import { DailyPuzzle } from "../components/Puzzle";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GameView } from "../lib/types";

type Dash = {
  history: { rating: number; delta: number; created_at: string }[];
  games: GameView[];
  invites: GameView[];
  friendsOnline: { id: number; username: string; displayName: string; publicId: string }[];
  incoming: number;
  achievements: { id: string; name: string; unlockedAt: string | null }[];
  challenges: { id: string; name: string; description: string; progress: number; target: number; done: boolean }[];
};

function resultLabel(game: GameView, userId: number) {
  if (game.status !== "finished") return game.status === "active" ? "Em jogo" : "Aguardando";
  if (game.result === "1/2-1/2") return "Empate";
  if (!game.result) return "Anulada";
  const won = (game.result === "1-0" && game.yourColor === "w") || (game.result === "0-1" && game.yourColor === "b");
  const lost = (game.result === "0-1" && game.yourColor === "w") || (game.result === "1-0" && game.yourColor === "b");
  if (won) return "Vitória";
  if (lost) return "Derrota";
  return userId ? (game.result ?? "—") : "—";
}

export function Dashboard() {
  const { user } = useAuth();
  const [pool, setPool] = useState<Pool>("blitz");
  const [span, setSpan] = useState<"7" | "30" | "all">("all");
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(false);
  useEffect(() => {
    setData(null);
    api<Dash>(`/api/me/dashboard?pool=${pool}`).then(setData).catch((reason: Error) => setError(reason.message));
  }, [pool]);
  if (!user) return null;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const rating = user.ratings[pool];
  const cutoff = span === "all" ? 0 : Date.now() - Number(span) * 86_400_000;
  const history = (data?.history ?? []).filter((point) => span === "all" || new Date(point.created_at).getTime() >= cutoff);
  const peak = history.length ? Math.max(...history.map((point) => point.rating), rating?.peak ?? 1200) : rating?.peak ?? 1200;
  const last = history.at(-1);
  const notices = (data?.incoming ?? 0) + (data?.invites.length ?? 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <Avatar avatar={user.avatar} name={user.displayName} size={48} />
          <div>
            <p className="text-sm text-ivory/80">{hello}</p>
            <p className="display text-2xl leading-none">{user.displayName}</p>
            <p className="muted text-xs">@{user.username} · #{user.publicId}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="kicker">{POOL_LABEL[pool]}</p>
            <p className="display text-4xl leading-none">{rating?.rating ?? 1200}</p>
          </div>
          <button type="button" className="btn btn-ghost relative" onClick={() => setNotes((value) => !value)} aria-expanded={notes}>
            Avisos
            {notices ? <span className="ml-2 text-gold-2">{notices}</span> : null}
          </button>
          <Link to="/perfil" className="btn btn-ghost">Perfil</Link>
          <Link to="/configuracoes" className="btn btn-ghost">Ajustes</Link>
        </div>
      </header>
      {notes ? (
        <div className="border border-line bg-panel p-4 text-sm">
          {!notices ? <p className="muted">Nenhum aviso novo.</p> : null}
          {data?.incoming ? <p><Link to="/amigos" className="text-gold-2">{data.incoming} pedido(s) de amizade</Link></p> : null}
          {data?.invites.map((game) => (
            <p key={game.id}><Link to={`/jogar/partida/${game.id}`} className="text-gold-2">Convite de partida #{game.id}</Link></p>
          ))}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="border border-line bg-panel p-5">
          <h1 className="display text-4xl">{hello}, {user.displayName.split(" ")[0]}.</h1>
          <p className="muted mt-2 max-w-lg text-sm">Seu rating, o histórico e os desafios desta página vêm das partidas registradas no servidor.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/jogar" className="btn btn-gold">Iniciar partida</Link>
            <Link to="/jogar?modo=bot" className="btn btn-ghost">Jogar contra bots</Link>
            <Link to="/amigos" className="btn btn-ghost">Desafiar um amigo</Link>
          </div>
        </div>
        <div className="border border-line bg-panel-2 p-5">
          <p className="kicker">Hoje</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.challenges ?? []).map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                <span>{item.name}</span>
                <span className={item.done ? "text-ok" : "muted"}>{item.progress}/{item.target}</span>
              </li>
            ))}
            {!data && !error ? <li className="skeleton h-16" /> : null}
          </ul>
          {data?.friendsOnline.length ? (
            <p className="muted mt-4 text-xs">{data.friendsOnline.length} amigo(s) online</p>
          ) : null}
        </div>
      </section>

      {error ? <p className="text-danger">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(POOL_LABEL) as Pool[]).map((item) => (
          <button key={item} type="button" className={`border p-4 text-left ${pool === item ? "border-gold/50 bg-panel" : "border-line bg-panel/60"}`} onClick={() => setPool(item)}>
            <p className="kicker">{POOL_LABEL[item]}</p>
            <p className="display text-3xl">{user.ratings[item]?.rating ?? 1200}</p>
            <p className="muted text-xs">{user.ratings[item]?.games ?? 0} partidas · pico {user.ratings[item]?.peak ?? 1200}</p>
          </button>
        ))}
        <article className="border border-line bg-panel p-4">
          <p className="kicker">Partidas</p>
          <p className="display text-3xl">{user.games}</p>
        </article>
        <article className="border border-line bg-panel p-4">
          <p className="kicker">Vitórias</p>
          <p className="display text-3xl">{user.wins}</p>
        </article>
        <article className="border border-line bg-panel p-4">
          <p className="kicker">Derrotas</p>
          <p className="display text-3xl">{user.losses}</p>
        </article>
        <article className="border border-line bg-panel p-4">
          <p className="kicker">Empates</p>
          <p className="display text-3xl">{user.draws}</p>
        </article>
        <article className="border border-line bg-panel p-4 sm:col-span-2 lg:col-span-2">
          <p className="kicker">Taxa de vitórias</p>
          <p className="display text-3xl">{user.winRate}%</p>
          <p className="muted text-xs">Vitórias sobre partidas concluídas.</p>
        </article>
        <article className="border border-line bg-panel p-4 sm:col-span-2 lg:col-span-2">
          <p className="kicker">Melhor rating</p>
          <p className="display text-3xl">{peak}</p>
          <p className="muted text-xs">Pico registrado em {POOL_LABEL[pool]}.</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-line bg-panel p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="kicker">Evolução · {POOL_LABEL[pool]}</p>
              <p className="display text-3xl">{rating?.rating ?? 1200}</p>
              <p className="muted text-xs">
                Pico {rating?.peak ?? 1200}
                {last ? ` · última variação ${last.delta > 0 ? "+" : ""}${last.delta}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              {([["7", "7 dias"], ["30", "30 dias"], ["all", "Tudo"]] as const).map(([id, label]) => (
                <button key={id} type="button" className={`btn ${span === id ? "btn-gold" : "btn-ghost"}`} onClick={() => setSpan(id)}>{label}</button>
              ))}
            </div>
          </div>
          {history.length < 2 ? (
            <p className="empty mt-4 text-sm">Ainda não há partidas classificadas suficientes em {POOL_LABEL[pool]} neste período para traçar a linha.</p>
          ) : (
            <svg viewBox="0 0 320 120" className="mt-4 h-36 w-full" role="img" aria-label="Evolução do rating">
              {(() => {
                const values = history.map((point) => point.rating);
                const min = Math.min(...values) - 10;
                const max = Math.max(...values) + 10;
                const coords = values.map((value, index) => {
                  const x = (index / (values.length - 1)) * 310 + 5;
                  const y = 110 - ((value - min) / (max - min)) * 100;
                  return [x, y] as const;
                });
                const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
                return (
                  <>
                    <polyline fill="none" stroke="#d4af65" strokeWidth="1.6" points={line} />
                    {coords.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="2.2" fill="#f5f3ef" />)}
                  </>
                );
              })()}
            </svg>
          )}
        </div>
        <div className="border border-line bg-panel p-5">
          <p className="kicker">Atividade recente</p>
          {!data && !error ? <div className="skeleton mt-4 h-24" /> : null}
          {!data?.games.length && data ? <p className="empty mt-4 text-sm">Nenhuma partida ainda.</p> : null}
          <ul className="mt-3 divide-y divide-line text-sm">
            {data?.games.map((game) => {
              const opponent = game.yourColor === "b" ? game.white : game.black;
              const delta = game.deltas.find((item) => item.userId === user.id);
              return (
                <li key={game.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="block">{opponent?.name ?? "Adversário"}</span>
                    <span className="muted text-xs">
                      {resultLabel(game, user.id)} · {opponent?.rating ?? "—"}
                      {delta ? ` · ${delta.delta > 0 ? "+" : ""}${delta.delta}` : ""}
                      {game.createdAt ? ` · ${new Date(game.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <Link to={`/jogar/partida/${game.id}`} className="text-gold-2">Partida</Link>
                    {game.status === "finished" ? <Link to={`/analisar/${game.id}`} className="text-gold-2">Análise</Link> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <DailyPuzzle />

      {data?.achievements.length ? (
        <section>
          <p className="kicker">Conquistas recentes</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {data.achievements.map((item) => <li key={item.id} className="border border-line px-3 py-1">{item.name}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
