import { useState } from "react";
import { BOARD_THEMES, type Preferences } from "../../shared/prefs";
import { Avatar, CRESTS } from "../components/Avatar";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { User } from "../lib/types";

export function Settings() {
  const { user, preferences, setSession } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(preferences);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [recovery, setRecovery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!user || !prefs) return <p className="muted">Carregando ajustes…</p>;

  async function save(body: unknown) {
    setError("");
    setMessage("");
    try {
      const data = await api<{ user: User; preferences: Preferences }>("/api/me", { method: "PATCH", body: JSON.stringify(body) });
      setSession(data.user, data.preferences);
      setPrefs(data.preferences);
      setMessage("Salvo.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="kicker">Configurações</p>
        <h1 className="display text-5xl">Conta e tabuleiro</h1>
        <p className="muted">ID permanente #{user.publicId}</p>
      </div>
      {message ? <p className="text-ok">{message}</p> : null}
      {error ? <p className="text-danger">{error}</p> : null}
      <section className="card space-y-3 p-5">
        <h2 className="display text-3xl">Perfil</h2>
        <div className="flex items-center gap-3"><Avatar avatar={user.avatar} name={user.displayName} size={56} /><span className="muted text-sm">Emblema ou foto</span></div>
        <div className="flex flex-wrap gap-2">
          {CRESTS.map((crest) => (
            <button key={crest} type="button" className="rounded-full" onClick={() => save({ avatar: crest })} aria-label={crest}>
              <Avatar avatar={crest} name={crest} size={42} />
            </button>
          ))}
        </div>
        <label className="block text-sm">Foto
          <input className="mt-1 block" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (file.size > 180_000) { setError("A imagem precisa ter no máximo 180 KB."); return; }
            const reader = new FileReader();
            reader.onload = () => save({ avatar: String(reader.result) });
            reader.readAsDataURL(file);
          }} />
        </label>
        <label className="block"><span className="label">Nome de exibição</span><input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label className="block"><span className="label">Bio</span><textarea className="field" maxLength={160} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
        <button type="button" className="btn btn-gold" onClick={() => save({ displayName, bio })}>Salvar perfil</button>
        <label className="block"><span className="label">Novo usuário</span><input className="field" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <button type="button" className="btn btn-ghost" onClick={() => save({ username })}>Alterar usuário</button>
        <p className="muted text-xs">O usuário pode mudar uma vez a cada 14 dias. O ID não muda.</p>
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="display text-3xl">Tabuleiro</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(BOARD_THEMES).map(([id, theme]) => (
            <button key={id} type="button" className={`btn ${prefs.theme === id ? "btn-gold" : "btn-ghost"}`} onClick={() => save({ preferences: { theme: id } })}>{theme.name}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["royal", "classic", "minimal"] as const).map((id) => (
            <button key={id} type="button" className={`btn ${prefs.pieces === id ? "btn-gold" : "btn-ghost"}`} onClick={() => save({ preferences: { pieces: id } })}>{id}</button>
          ))}
        </div>
        {([
          ["coordinates", "Coordenadas"],
          ["sounds", "Sons"],
          ["animations", "Animações"],
          ["allowMessages", "Receber mensagens de amigos"],
          ["allowInvites", "Receber convites de amigos"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prefs[key]} onChange={(event) => save({ preferences: { [key]: event.target.checked } })} />
            {label}
          </label>
        ))}
      </section>
      <section className="card space-y-3 p-5">
        <h2 className="display text-3xl">Senha</h2>
        <input className="field" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} placeholder="Senha atual" aria-label="Senha atual" />
        <input className="field" type="password" value={next} onChange={(event) => setNext(event.target.value)} placeholder="Nova senha" aria-label="Nova senha" />
        <button type="button" className="btn btn-gold" onClick={async () => {
          setError("");
          try {
            await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
            setMessage("Senha atualizada.");
            setNext("");
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Senha não alterada.");
          }
        }}>Alterar senha</button>
        <button type="button" className="btn btn-ghost" onClick={async () => {
          setError("");
          try {
            const data = await api<{ recoveryCode: string }>("/api/auth/recovery-code", { method: "POST", body: JSON.stringify({ current }) });
            setRecovery(data.recoveryCode);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Código não gerado.");
          }
        }}>Gerar novo código de recuperação</button>
        {recovery ? <p className="display text-2xl text-gold-2">{recovery}</p> : null}
        <p className="muted text-xs">O código anterior deixa de valer. Guarde o novo antes de sair desta página.</p>
      </section>
      <button type="button" className="btn btn-ghost" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>Sair da conta</button>
    </div>
  );
}
