import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Logo } from "./Logo";

const LINKS = [
  ["Painel", "/painel", "M3 12h18M3 6h18M3 18h18"],
  ["Jogar", "/jogar", "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"],
  ["Analisar", "/analisar", "M4 19V5m0 14h16M7 15l3-4 3 2 4-6"],
  ["Ranking", "/ranking", "M5 19V9m7 10V5m7 14v-7"],
  ["Amigos", "/amigos", "M8 18v-1a4 4 0 018 0v1M12 11a3 3 0 100-6 3 3 0 000 6z"],
  ["Perfil", "/perfil", "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0"],
  ["Ajustes", "/configuracoes", "M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2m12 0h2M12 4v2m0 12v2"],
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Shell() {
  const { user, loading } = useAuth();
  const path = useLocation().pathname;
  const guestOk = path === "/ranking" || /^\/perfil\/RC\d+$/i.test(path);
  if (loading) return <p className="grid min-h-screen place-items-center muted">Carregando sua conta…</p>;
  if (!user && !guestOk) return <Navigate to="/entrar" replace />;
  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-line bg-panel md:flex md:flex-col md:px-3 md:py-5">
        <NavLink to="/" className="px-2 focus-ring" aria-label="Royal Chess, início">
          <Logo />
        </NavLink>
        <nav className="mt-8 flex flex-col gap-1.5" aria-label="Principal">
          {LINKS.map(([label, to, icon]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link focus-ring ${isActive ? "active" : ""}`}>
              <Icon d={icon} />
              {label}
            </NavLink>
          ))}
        </nav>
        {user ? (
          <button
            type="button"
            className="btn btn-ghost mt-auto"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              window.location.href = "/";
            }}
          >
            Sair
          </button>
        ) : (
          <NavLink to="/entrar" className="btn btn-gold mt-auto">Entrar</NavLink>
        )}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur md:hidden">
          <Logo compact />
          <span className="text-sm text-gold-2">{user ? user.username : "Convidado"}</span>
        </header>
        <main className="page-wash mx-auto w-full max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-2 md:hidden" aria-label="Principal">
        {LINKS.map(([label, to, icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex min-w-16 flex-col items-center gap-1 px-2 text-[10px] ${isActive ? "text-gold-2" : "text-ivory/60"}`}>
            <Icon d={icon} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
