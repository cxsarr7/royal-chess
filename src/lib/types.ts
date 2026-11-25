export type Ratings = Record<string, { rating: number; peak: number; games: number }>;

export type User = {
  id: number;
  publicId: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  createdAt: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  ratings: Ratings;
};

export type Side = {
  bot: boolean;
  name: string;
  username?: string;
  publicId?: string;
  displayName?: string;
  avatar?: string | null;
  rating?: number;
  level?: string;
  style?: string;
  bio?: string;
  online?: boolean;
};

export type GameMove = { san: string; from: string; to: string; fen: string };

export type GameView = {
  id: number;
  code: string | null;
  status: string;
  result: string | null;
  reason: string | null;
  pool: string;
  baseMs: number;
  incMs: number;
  rated: boolean;
  fen: string;
  pgn: string;
  moves: GameMove[];
  white: Side | null;
  black: Side | null;
  whiteMs: number;
  blackMs: number;
  turnStartedAt: number | null;
  serverNow: number;
  yourColor: "w" | "b" | null;
  drawOfferedBy: number | null;
  awaitingYou: boolean;
  tournamentId: number | null;
  round: number | null;
  deltas: { userId: number; delta: number; rating: number }[];
  createdAt?: string;
};

export type Preferences = {
  theme: "royal" | "midnight" | "ivory" | "noir";
  pieces: "royal" | "classic" | "minimal";
  coordinates: boolean;
  sounds: boolean;
  animations: boolean;
  allowMessages: boolean;
  allowInvites: boolean;
};

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
