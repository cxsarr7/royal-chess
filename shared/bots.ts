export const BOT_LEVELS = [
  { id: "iniciante", name: "Nuno Vale", title: "Iniciante", elo: 400, avatar: "pawn", blurb: "Abre o jogo com calma e deixa passar táticas curtas.", depth: 2, movetime: 80, multipv: 4, limitElo: null, mistakeRate: 0.55, mistakeWindow: 150 },
  { id: "aprendiz", name: "Lia Pimenta", title: "Aprendiz", elo: 600, avatar: "pawn", blurb: "Desenvolve as peças e ainda erra combinações simples.", depth: 3, movetime: 100, multipv: 4, limitElo: null, mistakeRate: 0.4, mistakeWindow: 120 },
  { id: "casual", name: "Caio Leme", title: "Casual", elo: 800, avatar: "knight", blurb: "Disputa o centro, mas calcula pouco além do lance imediato.", depth: 4, movetime: 120, multipv: 3, limitElo: null, mistakeRate: 0.28, mistakeWindow: 90 },
  { id: "intermediario", name: "Maya Duarte", title: "Intermediário", elo: 1000, avatar: "knight", blurb: "Plano simples e sólido, com falhas quando a tática se alonga.", depth: 5, movetime: 150, multipv: 3, limitElo: null, mistakeRate: 0.18, mistakeWindow: 65 },
  { id: "avancado", name: "Heitor Braga", title: "Avançado", elo: 1200, avatar: "bishop", blurb: "Protege o rei e pune peças largadas sem defesa.", depth: 6, movetime: 180, multipv: 2, limitElo: null, mistakeRate: 0.1, mistakeWindow: 40 },
  { id: "experiente", name: "Irmão do Saxofonista Geffter", title: "Experiente", elo: 1400, avatar: "bishop", blurb: "🎷 fiscal oficial do contato físico. acredita que amizade verdadeira precisa de pelo menos 3 abraços, 2 encostadas no ombro e um contrato reconhecido em cartório. se você se afastar, ele interpreta como uma declaração de guerra. joga xadrez, mas aparentemente prefere jogar quem encosta primeiro.", depth: 8, movetime: 240, multipv: 1, limitElo: 1400, mistakeRate: 0, mistakeWindow: 0 },
  { id: "especialista", name: "César guloso", title: "Especialista", elo: 1600, avatar: "rook", blurb: "💔 corno por vocação, guloso por natureza e trouxa por circunstância. perdeu no amor, mas ainda tenta não perder no xadrez. dizem que até o rei levou chifre.", depth: 10, movetime: 320, multipv: 1, limitElo: 1600, mistakeRate: 0, mistakeWindow: 0 },
  { id: "mestre", name: "Vera Landau", title: "Mestre", elo: 1800, avatar: "rook", blurb: "Posição e tática no mesmo nível, sem entregar material.", depth: 12, movetime: 420, multipv: 1, limitElo: 1800, mistakeRate: 0, mistakeWindow: 0 },
  { id: "mestre-avancado", name: "Igor Salgado", title: "Mestre avançado", elo: 2000, avatar: "queen", blurb: "Explora fraquezas pequenas e evita contra-jogo.", depth: 13, movetime: 520, multipv: 1, limitElo: 2000, mistakeRate: 0, mistakeWindow: 0 },
  { id: "elite", name: "Clara Voss", title: "Elite", elo: 2200, avatar: "queen", blurb: "Cálculo longo e conversão limpa das vantagens.", depth: 15, movetime: 680, multipv: 1, limitElo: 2200, mistakeRate: 0, mistakeWindow: 0 },
  { id: "excepcional", name: "Adrian Wolf", title: "Excepcional", elo: 2400, avatar: "crown", blurb: "O adversário mais forte da casa. Quase não cede.", depth: 16, movetime: 860, multipv: 1, limitElo: 2400, mistakeRate: 0, mistakeWindow: 0 },
] as const;

export const BOT_STYLES = [
  { id: "equilibrado", name: "Equilibrado", blurb: "Material e posição na mesma medida." },
  { id: "agressivo", name: "Agressivo", blurb: "Prefere xeque e ataque quando o lance é equivalente." },
  { id: "posicional", name: "Posicional", blurb: "Segue a linha mais calma entre lances parecidos." },
  { id: "solido", name: "Sólido", blurb: "Prioriza o roque e a segurança do rei." },
  { id: "tatico", name: "Tático", blurb: "Escolhe a captura quando a avaliação empata." },
] as const;

export type BotLevel = (typeof BOT_LEVELS)[number];
export type BotId = BotLevel["id"];
export type StyleId = (typeof BOT_STYLES)[number]["id"];

const ALIAS: Record<string, BotId> = {
  apprentice: "aprendiz",
  amateur: "casual",
  club: "intermediario",
  expert: "especialista",
  master: "mestre",
  royal: "excepcional",
};

export function botById(id: string): BotLevel | null {
  const key = (ALIAS[id] ?? id) as BotId;
  return BOT_LEVELS.find((bot) => bot.id === key) ?? null;
}

export function styleById(id: string): StyleId {
  return BOT_STYLES.some((style) => style.id === id) ? (id as StyleId) : "equilibrado";
}
