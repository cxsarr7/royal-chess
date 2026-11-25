import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { BOARD_THEMES, type BoardThemeId, type PieceSetId } from "../../shared/prefs";
import { PieceGlyph } from "./Pieces";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

type Token = { id: string; square: Square; type: string; color: "w" | "b" };

function squareName(row: number, col: number, orientation: "white" | "black"): Square {
  const file = orientation === "white" ? col : 7 - col;
  const rank = orientation === "white" ? 8 - row : row + 1;
  return `${FILES[file]}${rank}` as Square;
}

function cellOf(square: Square, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return {
    col: orientation === "white" ? file : 7 - file,
    row: orientation === "white" ? 7 - rank : rank,
  };
}

function castleRook(from: Square, to: Square): { from: Square; to: Square } | null {
  if (from === "e1" && to === "g1") return { from: "h1", to: "f1" };
  if (from === "e1" && to === "c1") return { from: "a1", to: "d1" };
  if (from === "e8" && to === "g8") return { from: "h8", to: "f8" };
  if (from === "e8" && to === "c8") return { from: "a8", to: "d8" };
  return null;
}

let pieceSeq = 1;

export function Board({
  fen,
  orientation = "white",
  interactive = false,
  playColor = "both",
  theme = "royal",
  pieces = "royal",
  coordinates = true,
  animate = true,
  lastMove = null,
  onMove,
}: {
  fen: string;
  orientation?: "white" | "black";
  interactive?: boolean;
  playColor?: "w" | "b" | "both";
  theme?: BoardThemeId;
  pieces?: PieceSetId;
  coordinates?: boolean;
  animate?: boolean;
  lastMove?: { from: string; to: string } | null;
  onMove?: (from: string, to: string, promotion?: "q" | "r" | "b" | "n") => void;
}) {
  const chess = useMemo(() => new Chess(fen), [fen]);
  const colors = BOARD_THEMES[theme];
  const frameRef = useRef<HTMLDivElement>(null);
  const previous = useRef<Token[]>([]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; size: number } | null>(null);
  const dragMoved = useRef(false);
  const turn = chess.turn();

  const tokens = useMemo(() => {
    const found: Omit<Token, "id">[] = [];
    for (const file of FILES) {
      for (let rank = 1; rank <= 8; rank += 1) {
        const square = `${file}${rank}` as Square;
        const piece = chess.get(square);
        if (piece) found.push({ square, type: piece.type, color: piece.color });
      }
    }
    const prior = previous.current;
    const used = new Set<string>();
    const taken = new Set<string>();
    const out: Token[] = [];
    const link = (from: Square, to: Square) => {
      const before = prior.find((item) => item.square === from && !used.has(item.id));
      const after = found.find((item) => item.square === to);
      if (!before || !after) return;
      used.add(before.id);
      taken.add(to);
      out.push({ ...after, id: before.id });
    };
    if (lastMove) {
      link(lastMove.from as Square, lastMove.to as Square);
      const rook = castleRook(lastMove.from as Square, lastMove.to as Square);
      if (rook) link(rook.from, rook.to);
    }
    for (const next of found) {
      if (taken.has(next.square)) continue;
      const stay = prior.find((item) => item.square === next.square && item.type === next.type && item.color === next.color && !used.has(item.id));
      if (!stay) continue;
      used.add(stay.id);
      taken.add(next.square);
      out.push({ ...next, id: stay.id });
    }
    for (const next of found) {
      if (taken.has(next.square)) continue;
      const alike = prior.find((item) => item.type === next.type && item.color === next.color && !used.has(item.id));
      const id = alike?.id ?? `piece-${pieceSeq++}`;
      if (alike) used.add(alike.id);
      out.push({ ...next, id });
    }
    return out;
  }, [chess, lastMove]);

  useEffect(() => {
    previous.current = tokens;
  }, [tokens]);

  const targets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const move of chess.moves({ square: selected, verbose: true })) map.set(move.to, Boolean(move.captured));
    return map;
  }, [chess, selected]);

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const file of FILES) {
      for (let rank = 1; rank <= 8; rank += 1) {
        const square = `${file}${rank}` as Square;
        const piece = chess.get(square);
        if (piece?.type === "k" && piece.color === turn) return square;
      }
    }
    return null;
  }, [chess, turn]);

  function canTouch(square: Square): boolean {
    if (!interactive) return false;
    const piece = chess.get(square);
    if (!piece || piece.color !== turn) return false;
    return playColor === "both" || piece.color === playColor;
  }

  function tryMove(from: Square, to: Square) {
    const moves = chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
    if (!moves.length) {
      setSelected(canTouch(to) ? to : null);
      return;
    }
    if (moves.some((move) => move.promotion)) {
      setPending({ from, to });
      setSelected(null);
      return;
    }
    setSelected(null);
    onMove?.(from, to);
  }

  function squareAt(x: number, y: number): Square | null {
    for (const node of document.elementsFromPoint(x, y)) {
      const value = node.closest("[data-square]")?.getAttribute("data-square");
      if (value) return value as Square;
    }
    return null;
  }

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) dragMoved.current = true;
      setDrag((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
    };
    const up = (event: PointerEvent) => {
      const from = drag.from;
      const moved = dragMoved.current;
      setDrag(null);
      if (!moved) return;
      const target = squareAt(event.clientX, event.clientY);
      if (target) tryMove(from, target);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag?.from]);

  const draggingFrom = drag && dragMoved.current ? drag.from : null;

  return (
    <div className="board-frame" ref={frameRef}>
      <div className="board-grid">
        {Array.from({ length: 64 }, (_, index) => {
          const row = Math.floor(index / 8);
          const col = index % 8;
          const square = squareName(row, col, orientation);
          const light = (row + col) % 2 === 0;
          const last = lastMove && (lastMove.from === square || lastMove.to === square);
          const target = targets.get(square);
          return (
            <button
              key={square}
              type="button"
              data-square={square}
              className="sq"
              aria-label={square}
              style={{ background: light ? colors.light : colors.dark }}
              onClick={() => {
                if (dragMoved.current) {
                  dragMoved.current = false;
                  return;
                }
                if (selected) tryMove(selected, square);
                else if (canTouch(square)) setSelected(square);
              }}
            >
              {last ? <span className="sq-last" style={{ background: colors.last }} /> : null}
              {checkSquare === square ? <span className="sq-check" /> : null}
              {selected === square ? <span className="sq-selected" /> : null}
              {target === false ? <span className="sq-dot" style={{ background: colors.dot }} /> : null}
              {target === true ? <span className="sq-capture" style={{ borderColor: colors.dot }} /> : null}
              {coordinates && col === 0 ? (
                <span className="sq-rank" style={{ color: light ? colors.coordOnLight : colors.coordOnDark }}>{square[1]}</span>
              ) : null}
              {coordinates && row === 7 ? (
                <span className="sq-file" style={{ color: light ? colors.coordOnLight : colors.coordOnDark }}>{square[0]}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="board-pieces">
        {tokens.map((token) => {
          const cell = cellOf(token.square, orientation);
          const hidden = draggingFrom === token.square;
          return (
            <div
              key={token.id}
              className="board-piece"
              style={{
                transform: `translate(${cell.col * 100}%, ${cell.row * 100}%)`,
                transition: animate && !drag ? "transform 150ms ease" : "none",
                opacity: hidden ? 0 : 1,
              }}
              onPointerDown={(event) => {
                if (!canTouch(token.square)) {
                  if (selected && targets.has(token.square)) tryMove(selected, token.square);
                  return;
                }
                const size = (frameRef.current?.getBoundingClientRect().width ?? 480) / 8;
                dragMoved.current = false;
                setSelected(token.square);
                setDrag({ from: token.square, x: event.clientX, y: event.clientY, size });
              }}
            >
              <PieceGlyph type={token.type} color={token.color} set={pieces} />
            </div>
          );
        })}
      </div>
      {drag && dragMoved.current && chess.get(drag.from) ? (
        <div className="piece-ghost" style={{ left: drag.x, top: drag.y, width: drag.size, height: drag.size }}>
          <PieceGlyph type={chess.get(drag.from)!.type} color={chess.get(drag.from)!.color} set={pieces} />
        </div>
      ) : null}
      {pending ? (
        <div className="promo">
          <div className="card promo-card">
            <p className="display text-3xl">Promoção</p>
            <p className="muted mb-3 text-sm">Escolha a peça.</p>
            <div className="flex justify-center gap-2">
              {(["q", "r", "b", "n"] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  className="promo-choice"
                  onClick={() => {
                    onMove?.(pending.from, pending.to, piece);
                    setPending(null);
                  }}
                >
                  <PieceGlyph type={piece} color={turn} set={pieces} />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
