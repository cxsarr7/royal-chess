import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Board } from "../components/Board";
import { GLYPHS, MoveGlyph } from "../components/Glyph";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { START_FEN, type GameView, type User } from "../lib/types";

type Analysis = {
  engine: string;
  moves: { san: string; ply: number; color: "w" | "b"; classification: string; drop: number; bestSan: string | null; whiteCp: number }[];
  counts: { brilhante: number; genial: number; melhor: number; excelente: number; bom: number; teoria: number; imprecisao: number; erro: number; grave: number };
};

function advantage(cp: number): string {
  if (cp >= 9000) return "Brancas dão mate";
  if (cp <= -9000) return "Pretas dão mate";
  const pawns = Math.abs(cp) / 100;
  const side = cp >= 0 ? "Brancas" : "Pretas";
  return `${side} +${pawns.toFixed(1)}`;
}

export function Analyze() {
  const { user } = useAuth();
  const [games, setGames] = useState<GameView[]>([]);
  const [other, setOther] = useState("");
  const [compare, setCompare] = useState<{ a: User; b: User } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ games: GameView[] }>("/api/me/games").then((data) => setGames(data.games.filter((game) => game.status === "finished"))).catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Análise</p>
        <h1 className="display text-5xl">Histórico e comparação</h1>
      </div>
      <section className="card p-5">
        <h2 className="display text-3xl">Comparar jogadores</h2>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            setCompare(await api(`/api/compare?a=${user?.publicId}&b=${encodeURIComponent(other.replace("#", ""))}`));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível comparar.");
          }
        }}>
          <input className="field max-w-xs" value={other} onChange={(event) => setOther(event.target.value)} placeholder="ID do outro jogador" aria-label="ID do outro jogador" />
          <button className="btn btn-gold">Comparar comigo</button>
        </form>
        {compare ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
            {[compare.a, compare.b].map((person) => (
              <article key={person.publicId}>
                <h3 className="text-gold-2">{person.displayName} · #{person.publicId}</h3>
                <p>{person.wins}V {person.losses}D {person.draws}E · {person.winRate}%</p>
                <p className="muted">Blitz {person.ratings.blitz?.rating} · Rápidas {person.ratings.rapid?.rating}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      {error ? <p className="text-danger">{error}</p> : null}
      <section className="card p-5">
        <h2 className="display text-3xl">Partidas concluídas</h2>
        {!games.length ? <p className="muted mt-3 text-sm">Quando uma partida terminar, ela aparece aqui para revisão.</p> : (
          <ul className="mt-3 divide-y divide-ivory/10 text-sm">
            {games.map((game) => {
              const opponent = game.yourColor === "b" ? game.white : game.black;
              return (
                <li key={game.id} className="flex items-center justify-between py-3">
                  <span>{opponent?.name ?? "Adversário"} · {game.result ?? "—"} · {game.pool}</span>
                  <Link to={`/analisar/${game.id}`} className="text-gold-2">Abrir</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function AnalyzeGame() {
  const { id } = useParams();
  const { preferences } = useAuth();
  const [game, setGame] = useState<GameView | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ply, setPly] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    api<{ game: GameView }>(`/api/games/${id}`).then((data) => setGame(data.game)).catch((reason: Error) => setError(reason.message));
  }, [id]);
  const positions = game ? [START_FEN, ...game.moves.map((move) => move.fen)] : [START_FEN];
  const move = analysis?.moves[ply - 1];
  const cps = analysis?.moves.map((item) => Math.max(-600, Math.min(600, item.whiteCp))) ?? [];
  const line = cps.map((value, index) => `${(index / Math.max(1, cps.length - 1)) * 200},${30 - (value / 600) * 26}`).join(" ");
  const shownCp = move?.whiteCp ?? 0;
  const bar = Math.max(4, Math.min(96, 50 + (Math.max(-800, Math.min(800, shownCp)) / 800) * 50));
  const mistakes = analysis?.moves.filter((item) => item.classification === "erro" || item.classification === "grave") ?? [];
  return (
    <div className="game-layout">
      <div>
        <Board
          fen={positions[ply] ?? START_FEN}
          theme={preferences?.theme}
          pieces={preferences?.pieces}
          coordinates={preferences?.coordinates !== false}
          animate={preferences?.animations !== false}
          lastMove={ply > 0 && game ? { from: game.moves[ply - 1]!.from, to: game.moves[ply - 1]!.to } : null}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => setPly(0)}>Início</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly((value) => Math.max(0, value - 1))}>Anterior</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly((value) => Math.min(positions.length - 1, value + 1))}>Seguinte</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPly(positions.length - 1)}>Final</button>
        </div>
      </div>
      <div className="space-y-3">
        <div className="card p-4">
          <h1 className="display text-3xl">Partida #{id}</h1>
          {error ? <p className="text-danger">{error}</p> : null}
          {!analysis ? (
            <button type="button" className="btn btn-gold mt-3" disabled={pending} onClick={async () => {
              setPending(true);
              setError("");
              try {
                const data = await api<{ analysis: Analysis }>(`/api/games/${id}/analyze`, { method: "POST" });
                setAnalysis(data.analysis);
                setPly(positions.length - 1);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "A análise falhou.");
              } finally {
                setPending(false);
              }
            }}>{pending ? "O Stockfish está lendo a partida…" : "Analisar com Stockfish"}</button>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <p className="muted">Motor: Stockfish</p>
              <div>
                <div className="flex h-2 overflow-hidden rounded bg-[#1A140F]" aria-hidden="true">
                  <div className="h-full bg-[#F4EFE6]" style={{ width: `${bar}%` }} />
                </div>
                <p className="mt-2">{advantage(shownCp)} <span className="muted">({shownCp > 0 ? "+" : ""}{(shownCp / 100).toFixed(2)})</span></p>
              </div>
              {move ? (
                <p>
                  {move.color === "w" ? "Brancas" : "Pretas"} jogaram {move.san}. {GLYPHS[move.classification]?.name ?? move.classification}.
                  {move.bestSan && move.bestSan !== move.san ? ` Melhor lance: ${move.bestSan}.` : " Este foi o melhor lance."}
                  {move.drop >= 20 ? ` Perda de ${(move.drop / 100).toFixed(2)} peão.` : ""}
                </p>
              ) : <p className="muted">Posição inicial. Avance para ver cada lance.</p>}
              <p className="muted text-xs">
                {analysis.counts.brilhante} brilhantes · {analysis.counts.genial} geniais · {analysis.counts.melhor} melhores · {analysis.counts.excelente} excelentes · {analysis.counts.teoria} de teoria · {analysis.counts.imprecisao} imprecisões · {analysis.counts.erro} erros · {analysis.counts.grave} graves
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["w", "b"] as const).map((color) => {
                  const mine = analysis.moves.filter((item) => item.color === color);
                  if (!mine.length) return null;
                  const loss = mine.reduce((sum, item) => sum + Math.min(item.drop, 800), 0) / mine.length;
                  const accuracy = Math.max(0, Math.round(100 - loss / 8));
                  const misses = mine.filter((item) => item.classification === "imprecisao" || item.classification === "erro" || item.classification === "grave").length;
                  return (
                    <p key={color}>
                      <span className="muted block text-xs">{color === "w" ? "Brancas" : "Pretas"}</span>
                      Precisão estimada {accuracy}% · {misses} lance(s) abaixo do ideal
                    </p>
                  );
                })}
              </div>
              {cps.length > 1 ? (
                <svg viewBox="0 0 200 60" className="h-16 w-full" aria-label="Avaliação ao longo da partida">
                  <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(245,243,239,0.2)" />
                  <polyline fill="none" stroke="#D4AF65" strokeWidth="2" points={line} />
                </svg>
              ) : null}
            </div>
          )}
        </div>
        <div className="card max-h-80 overflow-auto p-3 text-sm">
          {Array.from({ length: Math.ceil((game?.moves.length ?? 0) / 2) }, (_, pair) => {
            const white = game?.moves[pair * 2];
            const black = game?.moves[pair * 2 + 1];
            const whiteNote = analysis?.moves[pair * 2];
            const blackNote = analysis?.moves[pair * 2 + 1];
            const cell = (item: NonNullable<typeof white>, note: typeof whiteNote, index: number) => (
              <button key={item.san + index} type="button" title={note ? `${note.color === "w" ? "Brancas" : "Pretas"} · ${GLYPHS[note.classification]?.name ?? note.classification}` : undefined} className={`flex items-center gap-1 rounded px-1 py-0.5 ${ply === index + 1 ? "text-gold-2" : ""}`} onClick={() => setPly(index + 1)}>
                <span>{item.san}</span>
                {note ? <MoveGlyph kind={note.classification} /> : null}
              </button>
            );
            return (
              <div key={pair} className="grid grid-cols-[1.5rem_1fr_1fr] items-center gap-1 py-0.5">
                <span className="muted">{pair + 1}.</span>
                {white ? cell(white, whiteNote, pair * 2) : <span />}
                {black ? cell(black, blackNote, pair * 2 + 1) : <span />}
              </div>
            );
          })}
        </div>
        {mistakes.length ? (
          <div className="card p-3 text-sm">
            <p className="kicker">Principais erros</p>
            <ul className="mt-2 space-y-1">
              {mistakes.map((item) => (
                <li key={item.ply}>
                  <button type="button" className="flex items-center gap-2" onClick={() => setPly(item.ply)}>
                    <MoveGlyph kind={item.classification} />
                    <span>{item.color === "w" ? "Brancas" : "Pretas"} · {item.san}</span>
                    {item.bestSan ? <span className="muted">melhor {item.bestSan}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
