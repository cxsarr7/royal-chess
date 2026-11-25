import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TIME_PRESETS } from "../../shared/time";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { useLive } from "../lib/live";

type Person = { id: number; requestId: number; publicId: string; username: string; displayName: string; avatar: string | null; online: boolean };
type Message = { id: number; senderId: number; body: string; createdAt: string };

export function Friends() {
  const [state, setState] = useState<{ friends: Person[]; incoming: Person[]; outgoing: Person[] } | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Person[]>([]);
  const [chatWith, setChatWith] = useState<Person | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [preset, setPreset] = useState("3+2");
  const [error, setError] = useState("");

  async function load() {
    setState(await api("/api/friends"));
  }
  useEffect(() => { load().catch((reason: Error) => setError(reason.message)); }, []);
  useLive((message) => {
    if (message.type === "friends" || message.type === "presence") load().catch(() => undefined);
    if (message.type === "message" && chatWith && (message.message as Message).senderId === chatWith.id) {
      setMessages((current) => [...current, message.message as Message]);
    }
  });

  async function openChat(person: Person) {
    setChatWith(person);
    const data = await api<{ messages: Message[] }>(`/api/friends/${person.id}/messages`);
    setMessages(data.messages);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-4">
        <div>
          <p className="kicker">Amigos</p>
          <h1 className="display text-5xl">Presença e pedidos</h1>
        </div>
        <form className="flex gap-2" onSubmit={async (event) => {
          event.preventDefault();
          const data = await api<{ players: Person[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);
          setFound(data.players);
        }}>
          <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Usuário ou #RC00000" aria-label="Buscar jogador" />
          <button className="btn btn-gold">Buscar</button>
        </form>
        {found.map((person) => (
          <div key={person.publicId} className="card flex items-center justify-between p-3 text-sm">
            <span>{person.displayName} · #{person.publicId}</span>
            <button type="button" className="btn btn-ghost" onClick={async () => {
              try { await api("/api/friends", { method: "POST", body: JSON.stringify({ identifier: person.publicId }) }); await load(); }
              catch (reason) { setError(reason instanceof Error ? reason.message : "Pedido não enviado."); }
            }}>Adicionar</button>
          </div>
        ))}
        {error ? <p className="text-danger">{error}</p> : null}
        <section className="card p-4">
          <h2 className="display text-3xl">Pedidos</h2>
          {!state?.incoming.length ? <p className="muted mt-2 text-sm">Nenhum pedido recebido.</p> : state.incoming.map((person) => (
            <div key={person.requestId} className="mt-3 flex items-center justify-between text-sm">
              <span>{person.displayName}</span>
              <span className="flex gap-2">
                <button type="button" className="btn btn-gold" onClick={async () => { await api(`/api/friends/${person.requestId}/accept`, { method: "POST" }); await load(); }}>Aceitar</button>
                <button type="button" className="btn btn-ghost" onClick={async () => { await api(`/api/friends/${person.requestId}/decline`, { method: "POST" }); await load(); }}>Recusar</button>
              </span>
            </div>
          ))}
          {state?.outgoing.map((person) => <p key={person.requestId} className="muted mt-2 text-sm">Aguardando {person.displayName}</p>)}
        </section>
        <section className="card p-4">
          <h2 className="display text-3xl">Lista</h2>
          {!state?.friends.length ? <p className="muted mt-2 text-sm">Você ainda não tem amigos.</p> : state.friends.map((person) => (
            <div key={person.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <Link to={`/perfil/${person.publicId}`} className="inline-flex items-center gap-2">
                <Avatar avatar={person.avatar} name={person.displayName} size={32} />
                <span>
                  <span className="block">{person.displayName}</span>
                  <span className="muted text-xs">@{person.username} · #{person.publicId}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs">
                  <span className={`dot ${person.online ? "bg-ok" : "bg-mute"}`} />
                  {person.online ? "online" : "offline"}
                </span>
              </Link>
              <span className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => openChat(person)}>Chat</button>
                <button type="button" className="btn btn-ghost" onClick={async () => {
                  const data = await api<{ game: { id: number } }>("/api/games/invite", { method: "POST", body: JSON.stringify({ preset, friendId: person.id, rated: true, color: "random" }) });
                  location.assign(`/jogar/partida/${data.game.id}`);
                }}>Convidar</button>
                <button type="button" className="btn btn-danger" onClick={async () => { await api(`/api/friends/${person.id}`, { method: "DELETE" }); await load(); }}>Remover</button>
              </span>
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {TIME_PRESETS.slice(0, 5).map((item) => (
              <button key={item.id} type="button" className={`btn ${preset === item.id ? "btn-gold" : "btn-ghost"}`} onClick={() => setPreset(item.id)}>{item.label}</button>
            ))}
          </div>
        </section>
      </div>
      <aside className="card flex min-h-80 flex-col p-4">
        <h2 className="display text-3xl">{chatWith ? chatWith.displayName : "Chat"}</h2>
        {!chatWith ? <p className="muted mt-3 text-sm">O chat só abre entre amigos. Mensagens são texto puro, com limite de tamanho e de frequência.</p> : (
          <>
            <div className="mt-3 flex-1 space-y-2 overflow-auto text-sm">
              {messages.map((message) => (
                <p key={message.id} className={message.senderId === chatWith.id ? "" : "text-gold-2"}>{message.body}</p>
              ))}
            </div>
            <form className="mt-3 flex gap-2" onSubmit={async (event) => {
              event.preventDefault();
              const data = await api<{ message: Message }>(`/api/friends/${chatWith.id}/messages`, { method: "POST", body: JSON.stringify({ body: draft }) });
              setMessages((current) => [...current, data.message]);
              setDraft("");
            }}>
              <input className="field" value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} aria-label="Mensagem" />
              <button className="btn btn-gold">Enviar</button>
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
