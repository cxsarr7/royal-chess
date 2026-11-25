import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { START_FEN } from "../lib/types";
import { POOL_LABEL } from "../../shared/time";

type Overview = {
  players: number;
  games: number;
  gamesToday: number;
  active: number;
  leaderboard: { public_id: string; username: string; display_name: string; rating: number; games: number }[];
};

const FEATURES = [
  ["Partidas em tempo real", "Desafie outro jogador com relógio, convite ou pareamento. O servidor valida cada lance."],
  ["Bots com estilo", "Seis níveis e cinco personalidades. A partida contra o bot não altera o rating."],
  ["Rating por ritmo", "Bullet, blitz, rápidas e clássicas têm rating próprio, atualizado só no servidor."],
  ["Amigos e chat", "Busca por usuário ou ID, pedidos, presença e mensagens apenas entre amigos."],
  ["Análise", "Revise a partida, veja imprecisões e o gráfico de avaliação do motor."],
  ["Revisão", "Cada partida terminada pode ser lida pelo Stockfish, lance a lance."],
];

export function Landing() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [chess, setChess] = useState(() => new Chess());
  const [error, setError] = useState("");

  useEffect(() => {
    api<Overview>("/api/overview").then(setOverview).catch((reason: Error) => setError(reason.message));
  }, []);

  const playHref = user ? "/jogar" : "/cadastro";

  return (
    <div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <a href="#recursos" className="btn btn-ghost hidden sm:inline-flex">Recursos</a>
          <a href="#ranking" className="btn btn-ghost hidden sm:inline-flex">Ranking</a>
          {user ? (
            <Link to="/painel" className="btn btn-gold">Abrir painel</Link>
          ) : (
            <>
              <Link to="/entrar" className="btn btn-ghost">Entrar</Link>
              <Link to="/cadastro" className="btn btn-gold">Criar conta</Link>
            </>
          )}
        </nav>
      </header>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <p className="kicker">Plataforma de xadrez</p>
          <h1 className="display mt-3 text-5xl leading-[0.95] text-ivory sm:text-7xl">
            O tabuleiro, com a calma de um clube privado.
          </h1>
          <p className="muted mt-5 max-w-xl text-lg">
            Royal Chess reúne partidas ao vivo, bots e rating. Sua conta é um nome de usuário e um ID permanente — sem e-mail.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={playHref} className="btn btn-gold px-6 py-3 text-base">Jogar agora</Link>
            <Link to="/ranking" className="btn btn-ghost px-6 py-3 text-base">Ver ranking</Link>
          </div>
        </div>
        <div>
          <Board
            fen={chess.fen()}
            interactive
            lastMove={chess.history({ verbose: true }).slice(-1)[0] ? { from: chess.history({ verbose: true }).slice(-1)[0]!.from, to: chess.history({ verbose: true }).slice(-1)[0]!.to } : null}
            onMove={(from, to, promotion) => {
              const next = new Chess(chess.fen());
              next.move({ from: from as "a1", to: to as "a1", promotion });
              setChess(next);
            }}
          />
          <p className="muted mt-3 text-center text-sm">Demonstração local. As regras são reais; esta partida não entra no ranking.</p>
          <button type="button" className="btn btn-ghost mx-auto mt-3" onClick={() => setChess(new Chess(START_FEN))}>Reiniciar demonstração</button>
        </div>
      </section>
      <section id="recursos" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="display text-4xl">O que a plataforma faz</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, text]) => (
            <article key={title} className="card p-5">
              <h3 className="display text-2xl text-gold-2">{title}</h3>
              <p className="muted mt-2 text-sm leading-relaxed">{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-8 sm:grid-cols-4">
        {[
          ["Jogadores", overview?.players],
          ["Partidas concluídas", overview?.games],
          ["Nas últimas 24 h", overview?.gamesToday],
          ["Em andamento", overview?.active],
        ].map(([label, value]) => (
          <article key={String(label)} className="card p-5">
            <p className="kicker">{label}</p>
            <p className="display mt-2 text-4xl">{value ?? "—"}</p>
          </article>
        ))}
      </section>
      {error ? <p className="px-4 text-center text-danger">{error}</p> : null}
      <section id="ranking" className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="display text-4xl">Melhores no blitz</h2>
          <Link to="/ranking" className="text-sm text-gold-2">Ranking completo</Link>
        </div>
        <div className="card overflow-hidden">
          {overview && overview.leaderboard.length === 0 ? (
            <p className="muted p-6">Nenhum jogador classificado ainda. Uma partida valendo rating coloca o primeiro nome aqui.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-ivory/50">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Jogador</th>
                  <th className="px-4 py-3 font-medium">Rating</th>
                  <th className="px-4 py-3 font-medium">Partidas</th>
                </tr>
              </thead>
              <tbody>
                {overview?.leaderboard.map((row, index) => (
                  <tr key={row.public_id} className="border-t border-ivory/10">
                    <td className="px-4 py-3 text-gold">{index + 1}</td>
                    <td className="px-4 py-3">
                      <Link to={`/perfil/${row.public_id}`} className="hover:text-gold-2">{row.display_name}</Link>
                      <span className="muted block text-xs">@{row.username} · #{row.public_id}</span>
                    </td>
                    <td className="px-4 py-3">{row.rating}</td>
                    <td className="px-4 py-3">{row.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      <footer className="border-t border-ivory/10 px-4 py-8 text-center text-sm text-ivory/50">
        Royal Chess · ritmos {Object.values(POOL_LABEL).join(", ")}
      </footer>
    </div>
  );
}
