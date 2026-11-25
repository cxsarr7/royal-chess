import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";

function Frame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" aria-label="Voltar ao início"><Logo /></Link>
        <div className="card mt-8 p-6">
          <h1 className="display text-4xl">{title}</h1>
          <p className="muted mt-2 text-sm">{lead}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (user) return <Navigate to="/painel" replace />;
  return (
    <Frame title="Entrar" lead="Use seu nome de usuário ou ID exclusivo, com a senha.">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          try {
            const data = await api<{ user: User }>("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({ identifier, password }),
            });
            setSession(data.user);
            navigate("/painel");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Falha no login.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="block"><span className="label">Usuário ou ID</span><input className="field" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /></label>
        <label className="block"><span className="label">Senha</span><input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <button className="btn btn-gold w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
      <p className="muted mt-4 text-sm">Novo por aqui? <Link to="/cadastro" className="text-gold-2">Criar conta</Link></p>
      <p className="mt-2 text-sm"><Link to="/recuperar" className="text-gold-2">Esqueci minha senha</Link></p>
    </Frame>
  );
}

export function RegisterPage() {
  const { user, setSession } = useAuth();
  const [form, setForm] = useState({ username: "", displayName: "", password: "", confirm: "" });
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [pending, setPending] = useState(false);
  if (user && !recovery) return <Navigate to="/painel" replace />;

  if (recovery) {
    return (
      <Frame title="Guarde este código" lead="Ele é a única forma de recuperar a senha. Não fica visível para outras pessoas e não será mostrado de novo.">
        <p className="display text-center text-3xl tracking-wide text-gold-2">{recovery}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn btn-ghost flex-1" onClick={() => navigator.clipboard.writeText(recovery)}>Copiar</button>
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => {
              const blob = new Blob([`Royal Chess\nCódigo de recuperação: ${recovery}\n`], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = "royal-chess-recuperacao.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Baixar
          </button>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
          Já guardei o código em um lugar seguro.
        </label>
        <button type="button" className="btn btn-gold mt-4 w-full" disabled={!saved} onClick={() => location.assign("/painel")}>Ir para o painel</button>
      </Frame>
    );
  }

  return (
    <Frame title="Criar conta" lead="Sem e-mail. Você escolhe o usuário; o ID exclusivo é gerado e não muda.">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          try {
            const data = await api<{ user: User; recoveryCode: string }>("/api/auth/register", {
              method: "POST",
              body: JSON.stringify(form),
            });
            setSession(data.user);
            setRecovery(data.recoveryCode);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Falha no cadastro.");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="block">
          <span className="label">Usuário</span>
          <input className="field" value={form.username} autoComplete="username" required onChange={async (event) => {
            const username = event.target.value;
            setForm({ ...form, username });
            if (/^[A-Za-z0-9_]{3,16}$/.test(username)) {
              const data = await api<{ available: boolean }>("/api/users/available?username=" + encodeURIComponent(username));
              setHint(data.available ? "Disponível." : "Já está em uso.");
            } else setHint("");
          }} />
          {hint ? <span className="mt-1 block text-xs text-gold-2">{hint}</span> : null}
        </label>
        <label className="block"><span className="label">Nome de exibição</span><input className="field" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Opcional" /></label>
        <label className="block"><span className="label">Senha</span><input className="field" type="password" value={form.password} autoComplete="new-password" required onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <label className="block"><span className="label">Confirmar senha</span><input className="field" type="password" value={form.confirm} autoComplete="new-password" required onChange={(event) => setForm({ ...form, confirm: event.target.value })} /></label>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <button className="btn btn-gold w-full" disabled={pending}>{pending ? "Criando…" : "Criar conta"}</button>
      </form>
      <p className="muted mt-4 text-sm">Já tem conta? <Link to="/entrar" className="text-gold-2">Entrar</Link></p>
    </Frame>
  );
}

export function RecoverPage() {
  const [form, setForm] = useState({ identifier: "", recoveryCode: "", password: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <Frame title="Recuperar senha" lead="Informe usuário ou ID e o código que você guardou no cadastro. O ID sozinho não recupera a conta.">
      {done ? (
        <p>Senha alterada. <Link to="/entrar" className="text-gold-2">Entrar</Link></p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            try {
              await api("/api/auth/recover", { method: "POST", body: JSON.stringify(form) });
              setDone(true);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : "Não foi possível recuperar.");
            }
          }}
        >
          <label className="block"><span className="label">Usuário ou ID</span><input className="field" value={form.identifier} required onChange={(event) => setForm({ ...form, identifier: event.target.value })} /></label>
          <label className="block"><span className="label">Código de recuperação</span><input className="field" value={form.recoveryCode} required onChange={(event) => setForm({ ...form, recoveryCode: event.target.value })} /></label>
          <label className="block"><span className="label">Nova senha</span><input className="field" type="password" value={form.password} required onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
          {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
          <button className="btn btn-gold w-full">Definir nova senha</button>
        </form>
      )}
    </Frame>
  );
}
