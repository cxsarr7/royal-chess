import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "./Board";

type Puzzle = {
  id: string;
  title: string;
  level: "Fácil" | "Médio";
  fen: string;
  move: string;
};

const PUZZLES: Puzzle[] = [
  {
    id: "mate-pastor",
    title: "Mate do pastor",
    level: "Fácil",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    move: "h5f7",
  },
  {
    id: "dama-solta",
    title: "Dama sem defesa",
    level: "Fácil",
    fen: "k7/8/8/8/8/8/7q/4K2R w K - 0 1",
    move: "h1h2",
  },
  {
    id: "dama-rei",
    title: "Mate com dama",
    level: "Médio",
    fen: "6k1/4Q3/6K1/8/8/8/8/8 w - - 0 1",
    move: "e7g7",
  },
  {
    id: "torre-fileira",
    title: "Torre na oitava",
    level: "Médio",
    fen: "6k1/5ppp/8/8/8/8/4RPPP/6K1 w - - 0 1",
    move: "e2e8",
  },
];

const KEY = "rc-puzzles";

function dayIndex() {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86_400_000);
  return day % PUZZLES.length;
}

function readSolved(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function DailyPuzzle() {
  const puzzle = PUZZLES[dayIndex()]!;
  const [fen, setFen] = useState(puzzle.fen);
  const [note, setNote] = useState("");
  const [solved, setSolved] = useState(() => readSolved());
  const done = solved.includes(puzzle.id);
  const turn = useMemo(() => new Chess(puzzle.fen).turn(), [puzzle.fen]);

  function onMove(from: string, to: string) {
    const played = `${from}${to}`;
    const chess = new Chess(puzzle.fen);
    const legal = chess.moves({ square: from as "a1", verbose: true }).some((item) => item.to === to);
    if (!legal) return;
    if (played !== puzzle.move) {
      setNote("Esse lance não resolve a posição. Tente outro.");
      return;
    }
    chess.move({ from, to, promotion: "q" });
    setFen(chess.fen());
    setNote(chess.isCheckmate() ? "Correto. É mate." : "Correto.");
    if (!done) {
      const next = [...solved, puzzle.id];
      localStorage.setItem(KEY, JSON.stringify(next));
      setSolved(next);
    }
  }

  return (
    <section className="grid gap-4 border border-line bg-panel p-4 lg:grid-cols-[minmax(0,220px)_1fr]">
      <div className="max-w-[220px]">
        <Board fen={fen} interactive={!done && !note.startsWith("Correto")} playColor={turn} coordinates={false} onMove={onMove} />
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-3">
        <div>
          <p className="kicker">Desafio do dia</p>
          <h2 className="display mt-1 text-3xl">{puzzle.title}</h2>
          <p className="muted mt-1 text-sm">{puzzle.level} · as brancas jogam e resolvem em um lance.</p>
          {note ? <p className={`mt-2 text-sm ${note.startsWith("Correto") ? "text-ok" : "text-danger"}`}>{note}</p> : null}
          {done && !note ? <p className="mt-2 text-sm text-ok">Você já resolveu este desafio neste dispositivo.</p> : null}
        </div>
        <div>
          <p className="text-sm">Progresso neste dispositivo</p>
          <p className="display text-2xl">{solved.length}<span className="muted text-base">/{PUZZLES.length}</span></p>
          <p className="muted text-xs">Conta apenas desafios que você resolveu aqui. Não entra no rating.</p>
        </div>
      </div>
    </section>
  );
}
