import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { POOL_LABEL, type Pool } from "../../shared/time";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

type Row = {
  public_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
  rating: number;
  peak: number;
  games: number;
  delta: number;
};

export function Ranking() {
  const { user } = useAuth();
  const [pool, setPool] = useState<Pool>("blitz");
  const [period, setPeriod] = useState<"all" | "week" | "month">("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ rows: Row[] }>(`/api/leaderboard?pool=${pool}&period=${period}`).then((data) => setRows(data.rows)).catch((reason: Error) => setError(reason.message));
  }, [pool, period]);
  const mine = rows.findIndex((row) => row.public_id === user?.publicId);
  const top = rows.slice(0, 3);
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Ranking</p>
        <h1 className="display text-5xl">{period === "all" ? "Classificação geral" : period === "week" ? "Ganhos da semana" : "Ganhos do mês"}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(POOL_LABEL) as Pool[]).map((item) => (
          <button key={item} type="button" className={`btn ${pool === item ? "btn-gold" : "btn-ghost"}`} onClick={() => setPool(item)}>{POOL_LABEL[item]}</button>
        ))}
      </div>
      <div className="flex gap-2">
        {([["all", "Geral"], ["week", "Semanal"], ["month", "Mensal"]] as const).map(([id, label]) => (
          <button key={id} type="button" className={`btn ${period === id ? "btn-gold" : "btn-ghost"}`} onClick={() => setPeriod(id)}>{label}</button>
        ))}
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      {mine >= 0 ? <p className="text-sm">Sua posição neste recorte: {mine + 1}</p> : null}
      {top.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {top.map((row, index) => (
            <Link key={row.public_id} to={`/perfil/${row.public_id}`} className="border border-line bg-panel p-4">
              <p className="kicker">{index + 1}º</p>
              <span className="mt-2 flex items-center gap-2">
                <Avatar avatar={row.avatar} name={row.display_name} size={36} />
                <span>
                  <span className="block">{row.display_name}</span>
                  <span className="muted text-xs">@{row.username}</span>
                </span>
              </span>
              <p className="display mt-3 text-3xl">{row.rating}</p>
            </Link>
          ))}
        </div>
      ) : null}
      <div className="card overflow-hidden">
        {!rows.length ? <p className="muted p-6">Ainda não há partidas classificadas neste recorte.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-ivory/50"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Jogador</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">{period === "all" ? "Pico" : "Variação"}</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.public_id} className={`border-t border-ivory/10 ${row.public_id === user?.publicId ? "bg-panel-2" : ""}`}>
                  <td className="px-4 py-3 text-gold">{index + 1}</td>
                  <td className="px-4 py-3">
                    <Link to={`/perfil/${row.public_id}`} className="inline-flex items-center gap-2 hover:text-gold-2">
                      <Avatar avatar={row.avatar} name={row.display_name} size={28} />
                      {row.display_name}
                    </Link>
                    <span className="muted block text-xs">@{row.username} · #{row.public_id}</span>
                  </td>
                  <td className="px-4 py-3">{row.rating}</td>
                  <td className="px-4 py-3">{period === "all" ? row.peak : `${row.delta > 0 ? "+" : ""}${row.delta}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
