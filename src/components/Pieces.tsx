import type { PieceSetId } from "../../shared/prefs";
import { RAW } from "./piece-raw";

function recolor(svg: string, color: "w" | "b", set: PieceSetId): string {
  if (set === "classic") return svg;
  if (set === "minimal") {
    const stroke = color === "w" ? "#F5F3EF" : "#D4AF65";
    return svg
      .replace(/fill="#[0-9a-fA-F]+"/g, 'fill="none"')
      .replace(/stroke="#[0-9a-fA-F]+"/g, `stroke="${stroke}"`);
  }
  if (color === "w") {
    return svg
      .replace(/#fff/gi, "#F4EFE6")
      .replace(/fill="#000"/g, 'fill="#3A2A16"')
      .replace(/stroke="#000"/g, 'stroke="#7A5A30"');
  }
  return svg
    .replace(/fill="#000"/g, 'fill="#16130F"')
    .replace(/stroke="#000"/g, 'stroke="#C6A15A"')
    .replace(/#ececec/gi, "#E8CB8A");
}

export function PieceGlyph({ type, color, set }: { type: string; color: "w" | "b"; set: PieceSetId }) {
  const markup = recolor(RAW[color][type] ?? "", color, set);
  const fill = set === "minimal" ? "none" : color === "w" ? "#F4EFE6" : "#16130F";
  return (
    <svg
      viewBox="0 0 45 45"
      className="piece-svg"
      aria-hidden="true"
      fill={set === "royal" && color === "b" ? fill : undefined}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
