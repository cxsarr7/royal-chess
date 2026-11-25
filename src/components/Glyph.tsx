export const GLYPHS: Record<string, { name: string; mark: string; color: string }> = {
  brilhante: { name: "Brilhante", mark: "!!", color: "#E8CB8A" },
  genial: { name: "Genial", mark: "!", color: "#8FB4D6" },
  melhor: { name: "Melhor movimento", mark: "!!", color: "#8EA584" },
  excelente: { name: "Excelente", mark: "!", color: "#B7B7C0" },
  bom: { name: "Bom", mark: "!", color: "#8EA584" },
  teoria: { name: "Teoria", mark: "", color: "#C4A36A" },
  imprecisao: { name: "Imprecisão", mark: "?!", color: "#D6B15E" },
  erro: { name: "Erro", mark: "?", color: "#E08A3C" },
  grave: { name: "Erro grave", mark: "??", color: "#C45C4A" },
  forcado: { name: "Movimento forçado", mark: "", color: "#92929B" },
};

export function MoveGlyph({ kind, size = 18 }: { kind: string; size?: number }) {
  const glyph = GLYPHS[kind];
  if (!glyph) return null;
  const circled = kind === "excelente" || kind === "genial" || kind === "brilhante";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="inline-block align-middle">
      <title>{glyph.name}</title>
      {kind === "teoria" ? (
        <path d="M5 6.5c2-1.2 4-.8 7 .4 3-1.2 5-1.6 7-.4V18c-2-1.2-4-.8-7 .4-3-1.2-5-1.6-7-.4V6.5z" fill="none" stroke={glyph.color} strokeWidth="1.5" strokeLinejoin="round" />
      ) : null}
      {kind === "forcado" ? (
        <path d="M7 8h6.5a3.5 3.5 0 010 7H10m0 0l2.2-2.2M10 15l2.2 2.2" fill="none" stroke={glyph.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {glyph.mark ? (
        <>
          {circled ? <circle cx="12" cy="12" r="9" fill={kind === "brilhante" ? "rgba(212,175,101,0.16)" : "none"} stroke={glyph.color} strokeWidth="1.3" /> : null}
          <text x="12" y="16" textAnchor="middle" fontSize={glyph.mark.length > 1 ? 9 : 12} fontFamily="Outfit, sans-serif" fontWeight="600" fill={glyph.color}>
            {glyph.mark}
          </text>
        </>
      ) : null}
    </svg>
  );
}
