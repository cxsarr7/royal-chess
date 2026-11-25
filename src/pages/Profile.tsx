import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GameView, User } from "../lib/types";
import { POOL_LABEL, type Pool } from "../../shared/time";

export function Profile() {
  const { publicId } = useParams();
  const { user: me } = useAuth();
  const target = publicId || me?.publicId;
  const [data, setData] = useState<{ user: User; achievements: { id: string; name: string; description: string; unlockedAt: string | null }[]; games: GameView[]; online: boolean } | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<{ rating: number }[]>([]);
  useEffect(() => {
    if (!target) return;
    api<{ user: User; achievements: { id: string; name: string; description: string; unlockedAt: string | null }[]; games: GameView[]; online: boolean }>(`/api/users/${target}`)
      .then(setData)
      .catch((reason: Error) => setError(reason.message));
  }, [target]);
  useEffect(() => {
    if (!data || me?.id !== data.user.id) return;
    api<{ history: { rating: number }[] }>("/api/me/dashboard?pool=blitz").then((payload) => setHistory(payload.history)).catch(() => setHistory([]));
  }, [data, me?.id]);
  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return (
    <div className="space-y-3">
      <div className="skeleton h-16 w-full" />
      <div className="skeleton h-24 w-full" />
    </div>
  );
  const person = data.user;
  const mine = me?.id === person.id;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar avatar={person.avatar} name={person.displayName} size={72} />
        <div>
          <p className="kicker">{data.online ? "Online" : "Offline"}</p>
          <h1 className="display text-5xl">{person.displayName}</h1>
          <p className="muted">@{person.username} · #{person.publicId}</p>
          <p className="muted text-sm">Na plataforma desde {new Date(person.createdAt).toLocaleDateString("pt-BR")}</p>
          {person.bio ? <p className="mt-2 max-w-xl text-sm">{person.bio}</p> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(Object.keys(POOL_LABEL) as Pool[]).map((pool) => (
          <article key={pool} className="card p-4">
            <p className="kicker">{POOL_LABEL[pool]}</p>
            <p className="display text-4xl">{person.ratings[pool]?.rating ?? 1200}</p>
            <p className="muted text-xs">pico {person.ratings[pool]?.peak ?? 1200}</p>
          </article>
        ))}
      </div>
      <section className="grid gap-3 sm:grid-cols-4">
        <article className="card p-4"><p className="kicker">Partidas</p><p className="display text-3xl">{person.games}</p></article>
        <article className="card p-4"><p className="kicker">Vitórias</p><p className="display text-3xl">{person.wins}</p></article>
        <article className="card p-4"><p className="kicker">Derrotas / empates</p><p className="display text-3xl">{person.losses}/{person.draws}</p></article>
        <article className="card p-4"><p className="kicker">Aproveitamento</p><p className="display text-3xl">{person.winRate}%</p></article>
      </section>
      {mine ? (
        <section className="border border-line bg-panel p-5">
          <p className="kicker">Evolução no blitz</p>
          {history.length < 2 ? <p className="empty mt-3 text-sm">A linha aparece depois de duas partidas classificadas de blitz.</p> : (
            <svg viewBox="0 0 320 90" className="mt-3 h-24 w-full" role="img" aria-label="Evolução do rating de blitz">
              {(() => {
                const values = history.map((point) => point.rating);
                const min = Math.min(...values) - 10;
                const max = Math.max(...values) + 10;
                const points = values.map((value, index) => `${(index / (values.length - 1)) * 310 + 5},${80 - ((value - min) / (max - min)) * 70}`).join(" ");
                return <polyline fill="none" stroke="#d4af65" strokeWidth="1.6" points={points} />;
              })()}
            </svg>
          )}
        </section>
      ) : null}
      <section className="border border-line bg-panel p-5">
        <h2 className="display text-3xl">Conquistas</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {data.achievements.map((item) => (
            <li key={item.id} className={`border border-line px-3 py-2 text-sm ${item.unlockedAt ? "" : "opacity-45"}`}>
              <span className="block">{item.name}</span>
              <span className="muted text-xs">{item.description}</span>
              <span className="muted block text-xs">{item.unlockedAt ? `Desbloqueada em ${new Date(item.unlockedAt).toLocaleDateString("pt-BR")}` : "Ainda não alcançada"}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="border border-line bg-panel p-5">
        <h2 className="display text-3xl">Histórico</h2>
        {!data.games.length ? <p className="empty mt-3 text-sm">Sem partidas concluídas.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {data.games.map((game) => {
              const opponent = game.yourColor === "b" ? game.white : game.black;
              return (
                <li key={game.id}>
                  <Link to={`/jogar/partida/${game.id}`} className="text-gold-2">{opponent?.name ?? "Adversário"}</Link>
                  {" · "}{game.result ?? game.status} · {game.pool}
                  {game.status === "finished" ? <> · <Link to={`/analisar/${game.id}`} className="text-gold-2">Análise</Link></> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {!mine && me ? (
        <button type="button" className="btn btn-gold" onClick={async () => {
          try { await api("/api/friends", { method: "POST", body: JSON.stringify({ identifier: person.publicId }) }); setError(""); alert("Pedido enviado."); }
          catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível adicionar."); }
        }}>Adicionar amigo</button>
      ) : null}
      {mine ? <Link to="/configuracoes" className="text-gold-2">Editar perfil</Link> : null}
    </div>
  );
}
