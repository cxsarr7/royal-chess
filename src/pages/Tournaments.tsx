import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TIME_PRESETS } from "../../shared/time";
import { api } from "../lib/api";

type Tour = {
  id: number;
  name: string;
  visibility: string;
  status: string;
  players: number;
  maxPlayers: number;
  rounds: number;
  currentRound: number;
  pool: string;
  yours?: boolean;
};

type Detail = {
  id: number;
  name: string;
  visibility: string;
  joinCode: string | null;
  status: string;
  rounds: number;
  currentRound: number;
  maxPlayers: number;
  isHost: boolean;
  joined: boolean;
  pool: string;
  baseMs: number;
  incMs: number;
  standings: { rank: number; username: string; displayName: string; publicId: string; score: number }[];
  games: { id: number; round: number | null; status: string; result: string | null; whiteId: number | null; blackId: number | null }[];
};

export function Tournaments() {
  const [rows, setRows] = useState<Tour[]>([]);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [preset, setPreset] = useState("5+0");
  const [rounds, setRounds] = useState(3);
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [code, setCode] = useState("");
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ tournaments: Tour[] }>("/api/tournaments");
    setRows(data.tournaments);
  }
  useEffect(() => { load().catch((reason: Error) => setError(reason.message)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Torneios</p>
        <h1 className="display text-5xl">Tabelas e rodadas</h1>
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      <section className="card space-y-3 p-5">
        <h2 className="display text-3xl">Criar</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">Nome</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label><span className="label">Visibilidade</span>
            <select className="field" value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")}>
              <option value="public">Público</option>
              <option value="private">Privado</option>
            </select>
          </label>
          <label><span className="label">Ritmo</span>
            <select className="field" value={preset} onChange={(event) => setPreset(event.target.value)}>
              {TIME_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label><span className="label">Rodadas</span><input className="field" type="number" min={1} max={7} value={rounds} onChange={(event) => setRounds(Number(event.target.value))} /></label>
          <label><span className="label">Máximo de jogadores</span><input className="field" type="number" min={2} max={16} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} /></label>
        </div>
        <button type="button" className="btn btn-gold" onClick={async () => {
          setError("");
          try {
            const data = await api<{ tournament: Detail }>("/api/tournaments", { method: "POST", body: JSON.stringify({ name, visibility, preset, rounds, maxPlayers }) });
            location.assign(`/torneios/${data.tournament.id}`);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível criar.");
          }
        }}>Criar torneio</button>
      </section>
      <section className="card p-5">
        <h2 className="display text-3xl">Entrar com código</h2>
        <form className="mt-3 flex gap-2" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const data = await api<{ tournament: Detail }>(`/api/tournaments/${joinId}/join`, { method: "POST", body: JSON.stringify({ code }) });
            location.assign(`/torneios/${data.tournament.id}`);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Código recusado.");
          }
        }}>
          <input className="field" value={joinId} onChange={(event) => setJoinId(event.target.value)} placeholder="Número" aria-label="Número do torneio" />
          <input className="field" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código" aria-label="Código" />
          <button className="btn btn-ghost">Entrar</button>
        </form>
      </section>
      <section className="card p-5">
        <h2 className="display text-3xl">Abertos</h2>
        {!rows.length ? <p className="muted mt-3 text-sm">Nenhum torneio público no momento.</p> : (
          <ul className="mt-3 divide-y divide-ivory/10">
            {rows.map((tour) => (
              <li key={tour.id} className="flex items-center justify-between py-3 text-sm">
                <span>{tour.name} · {tour.players}/{tour.maxPlayers} · {tour.status}</span>
                <Link to={`/torneios/${tour.id}`} className="text-gold-2">Abrir</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function TournamentDetail() {
  const { id } = useParams();
  const [tour, setTour] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  async function load() {
    const data = await api<{ tournament: Detail }>(`/api/tournaments/${id}`);
    setTour(data.tournament);
  }
  useEffect(() => { load().catch((reason: Error) => setError(reason.message)); }, [id]);
  if (!tour) return error ? <p className="text-danger">{error}</p> : <p className="muted">Carregando torneio…</p>;
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">{tour.visibility === "private" ? "Privado" : "Público"} · {tour.pool}</p>
        <h1 className="display text-5xl">{tour.name}</h1>
        <p className="muted text-sm">Rodada {tour.currentRound} de {tour.rounds} · {tour.status}</p>
        {tour.joinCode ? <p className="mt-2 text-gold-2">Código {tour.joinCode}</p> : null}
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {tour.status === "registration" && !tour.joined ? <button type="button" className="btn btn-gold" onClick={async () => {
          try { await api(`/api/tournaments/${id}/join`, { method: "POST", body: "{}" }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha na inscrição."); }
        }}>Inscrever</button> : null}
        {tour.isHost && tour.status === "registration" ? <button type="button" className="btn btn-gold" onClick={async () => {
          try { await api(`/api/tournaments/${id}/start`, { method: "POST" }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível iniciar."); }
        }}>Iniciar</button> : null}
      </div>
      <section className="card p-5">
        <h2 className="display text-3xl">Classificação</h2>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {tour.standings.map((row) => (
              <tr key={row.publicId} className="border-t border-ivory/10">
                <td className="py-2 text-gold">{row.rank}</td>
                <td><Link to={`/perfil/${row.publicId}`}>{row.displayName}</Link> <span className="muted">@{row.username}</span></td>
                <td>{row.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-5">
        <h2 className="display text-3xl">Partidas</h2>
        {!tour.games.length ? <p className="muted mt-3 text-sm">As mesas aparecem quando o torneio começa.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {tour.games.map((game) => (
              <li key={game.id}><Link to={`/jogar/partida/${game.id}`} className="text-gold-2">Rodada {game.round} · partida {game.id}</Link> · {game.result ?? game.status}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
