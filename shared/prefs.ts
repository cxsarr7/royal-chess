export type BoardThemeId = "royal" | "midnight" | "ivory" | "noir";
export type PieceSetId = "royal" | "classic" | "minimal";

export type Preferences = {
  theme: BoardThemeId;
  pieces: PieceSetId;
  coordinates: boolean;
  sounds: boolean;
  animations: boolean;
  allowMessages: boolean;
  allowInvites: boolean;
};

export const DEFAULT_PREFS: Preferences = {
  theme: "royal",
  pieces: "royal",
  coordinates: true,
  sounds: true,
  animations: true,
  allowMessages: true,
  allowInvites: true,
};

export const BOARD_THEMES: Record<
  BoardThemeId,
  { name: string; light: string; dark: string; last: string; dot: string; coordOnLight: string; coordOnDark: string }
> = {
  royal: {
    name: "Royal",
    light: "#E8D7B6",
    dark: "#B58863",
    last: "rgba(212, 175, 101, 0.55)",
    dot: "rgba(20, 16, 12, 0.45)",
    coordOnLight: "#6B4E32",
    coordOnDark: "#F6E7C8",
  },
  midnight: {
    name: "Meia-noite",
    light: "#4C5D70",
    dark: "#2A3848",
    last: "rgba(232, 203, 138, 0.38)",
    dot: "rgba(245, 243, 239, 0.72)",
    coordOnLight: "#D5DEE8",
    coordOnDark: "#9AABBE",
  },
  ivory: {
    name: "Marfim",
    light: "#F0E6D4",
    dark: "#7F9168",
    last: "rgba(196, 154, 60, 0.42)",
    dot: "rgba(20, 16, 12, 0.4)",
    coordOnLight: "#6A5A42",
    coordOnDark: "#F4F0E6",
  },
  noir: {
    name: "Noir",
    light: "#6E6E76",
    dark: "#3A3A42",
    last: "rgba(212, 175, 101, 0.42)",
    dot: "rgba(245, 243, 239, 0.8)",
    coordOnLight: "#F5F3EF",
    coordOnDark: "#C8C8CE",
  },
};

export function parsePrefs(raw: unknown): Preferences {
  const src = raw && typeof raw === "object" ? (raw as Partial<Preferences>) : {};
  const theme = src.theme && src.theme in BOARD_THEMES ? src.theme : DEFAULT_PREFS.theme;
  const pieces: PieceSetId =
    src.pieces === "classic" || src.pieces === "minimal" || src.pieces === "royal"
      ? src.pieces
      : "royal";
  return {
    theme,
    pieces,
    coordinates: src.coordinates !== false,
    sounds: src.sounds !== false,
    animations: src.animations !== false,
    allowMessages: src.allowMessages !== false,
    allowInvites: src.allowInvites !== false,
  };
}
