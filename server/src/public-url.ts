/**
 * Public address of the single Royal Chess service.
 * The site, the API and the websocket share this origin.
 * Leave APP_URL empty in local development.
 */

export type PublicUrl = {
  canonical: string | null;
  aliases: string[];
};

function originOf(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} precisa ser uma origem absoluta, como https://exemplo.com.br.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} precisa usar http ou https.`);
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error(`${label} deve conter só o esquema e o domínio, sem caminho, usuário ou consulta.`);
  }
  return url.origin;
}

export function publicUrl(): PublicUrl {
  const raw = process.env.APP_URL?.trim() ?? "";
  const canonical = raw ? originOf(raw, "APP_URL") : null;
  const aliases = (process.env.APP_URL_ALIASES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => originOf(item, "APP_URL_ALIASES"));
  if (canonical && aliases.includes(canonical)) {
    throw new Error("APP_URL_ALIASES não pode repetir APP_URL.");
  }
  return { canonical, aliases };
}

/** 308 target when the request host is a configured alias. Local and unknown hosts stay put. */
export function canonicalRedirect(protocol: string, host: string, originalUrl: string): string | null {
  const { canonical, aliases } = publicUrl();
  if (!canonical || !host) return null;
  const requestOrigin = `${protocol}://${host.toLowerCase()}`;
  if (requestOrigin === canonical) return null;
  if (!aliases.includes(requestOrigin)) return null;
  return canonical + originalUrl;
}

export function sessionCookie(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
}
