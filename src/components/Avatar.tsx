const PRESETS = ["crown", "rook", "knight", "queen", "bishop", "pawn", "lion", "star"] as const;
export type Crest = (typeof PRESETS)[number];

export function isCrest(value: string | null | undefined): value is Crest {
  return Boolean(value && (PRESETS as readonly string[]).includes(value));
}

export function Avatar({
  avatar,
  name,
  size = 40,
}: {
  avatar?: string | null;
  name: string;
  size?: number;
}) {
  if (avatar && avatar.startsWith("data:image/")) {
    return <img src={avatar} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="23" fill="#252529" stroke="#D4AF65" strokeWidth="1.2" />
      <CrestShape id={isCrest(avatar) ? avatar : "crown"} />
    </svg>
  );
}

function CrestShape({ id }: { id: Crest }) {
  const common = { fill: "none", stroke: "#E8CB8A", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  if (id === "rook") return <path {...common} d="M16 32h16M17 32V22h3v3h2v-3h4v3h2v-3h3v10" />;
  if (id === "knight") return <path {...common} d="M18 32c2-8 2-12 6-14 2 3 2 5 1 7 3-1 6-1 7 2 1 4-2 7-8 7h-6z" />;
  if (id === "queen") return <path {...common} d="M16 32l2.5-12L24 26l5.5-6L32 32M18 18h.1M24 14h.1M30 18h.1" />;
  if (id === "bishop") return <path {...common} d="M24 14c4 4 6 8 6 12 0 3-2 6-6 6s-6-3-6-6c0-4 2-8 6-12zM24 20v6" />;
  if (id === "pawn") return <path {...common} d="M24 16a4 4 0 110 8c-3 1-6 4-6 8h12c0-4-3-7-6-8a4 4 0 01-0-8z" />;
  if (id === "lion") return <path {...common} d="M18 30c0-6 2-10 6-12 4 2 6 6 6 12M20 22c-2-3-1-6 2-7M28 22c2-3 1-6-2-7M24 24v4" />;
  if (id === "star") return <path {...common} d="M24 14l2.4 6.2H33l-5.2 3.8 2 6.2L24 26.8 18.2 30.2l2-6.2L15 20.2h6.6z" />;
  return <path {...common} d="M24 13v4M16 32h16M18 32c1-6 2.2-8 6-9 3.8 1 5 3 6 9M21 17h6" />;
}

export const CRESTS: Crest[] = [...PRESETS];
