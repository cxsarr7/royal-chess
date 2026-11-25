import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TIME_PRESETS, formatControl, type Pool } from "../../shared/time";
import { BOT_LEVELS, BOT_STYLES } from "../../shared/bots";
import { Avatar } from "../components/Avatar";
import { api } from "../lib/api";
import { useLive } from "../lib/live";
import type { GameView } from "../lib/types";

export function Play() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("modo") === "bot" ? "bot" : "online");
  const [preset, setPreset] = useState("3+2");
  const [custom, setCustom] = useState(false);
  const [baseMin, setBaseMin] = useState(10);
  const [incSec, setIncSec] = useState(0);
  const [rated, setRated] = useState(true);
  const [level, setLevel] = useState("intermediario");
  const [style, setStyle] = useState("equilibrado");
  const [color, setColor] = useState<"white" | "black" | "random">("white");
  const [code, setCode] = useState("");
  const [friendId, setFriendId] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [band, setBand] = useState<"todos" | "iniciante" | "clube" | "forte" | "elite">("todos");

  useLive((message) => {
    if (message.type === "matched" && message.game) navigate(`/jogar/partida/${(message.game as GameView).id}`);
  });

  useEffect(() => {
    const sala = params.get("sala");
    if (!sala) return;
    let stop = false;
    api<{ game: GameView }>("/api/games/join", { method: "POST", body: JSON.stringify({ code: sala }) })
      .then((data) => { if (!stop) navigate(`/jogar/partida/${data.game.id}`); })
      .catch((reason: Error) => { if (!stop) setError(reason.message); });
    return () => { stop = true; };
  }, [params]);

  useEffect(() => () => {
    if (waiting) api("/api/games/seek", { method: "DELETE" }).catch(() => undefined);
  }, [waiting]);

  const time = custom ? { baseMin, incSec } : { preset };
  const groups: Pool[] = ["bullet", "blitz", "rapid", "classical"];

  async function startBot() {
    setPending(true);
    setError("");
    try {
      const data = await api<{ game: GameView }>("/api/games/bot", { method: "POST", body: JSON.stringify({ ...time, level, style, color }) });
      navigate(`/jogar/partida/${data.game.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao criar a partida.");
    } finally {
      setPending(false);
    }
  }

  async function seek() {
    setPending(true);
    setError("");
    try {
      const data = await api<{ waiting?: boolean; game?: GameView }>("/api/games/seek", {
        method: "POST",
        body: JSON.stringify({ ...time, rated }),
      });
      if (data.game) navigate(`/jogar/partida/${data.game.id}`);
      else setWaiting(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha no pareamento.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Jogar</p>
        <h1 className="display text-5xl">Escolha o ritmo e o adversário</h1>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {([
          ["online", "3+2", false, "Partida rápida", "Entra na fila de blitz 3+2."],
          ["online", "30+0", false, "Partida clássica", "Fila de clássicas 30+0."],
          ["online", "10+0", true, "Partida personalizada", "Você define minutos e incremento."],
          ["bot", "3+2", false, "Jogar contra bots", "Onze adversários, de 400 a 2400."],
          ["amigo", "3+2", false, "Jogar com amigos", "Convite pelo ID interno do amigo."],
          ["sala", "10+0", false, "Partida privada", "Cria um link ou entra com um código."],
        ] as const).map(([id, timeId, isCustom, title, text]) => (
          <button
            key={title}
            type="button"
            className={`border p-4 text-left transition-colors hover:border-gold/40 ${mode === id && (id !== "online" || (isCustom ? custom : preset === timeId && !custom)) ? "border-gold/50 bg-panel" : "border-line bg-panel/70"}`}
            onClick={() => { setMode(id); setPreset(timeId); setCustom(isCustom); }}
          >
            <span className="display block text-2xl">{title}</span>
            <span className="muted mt-1 block text-sm">{text}</span>
          </button>
        ))}
      </div>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="display text-3xl">Tempo</h2>
          <button type="button" className="text-sm text-gold-2" onClick={() => setCustom((value) => !value)}>{custom ? "Usar ritmos prontos" : "Tempo personalizado"}</button>
        </div>
        {custom ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Minutos</span><input className="field" type="number" min={1} max={180} value={baseMin} onChange={(event) => setBaseMin(Number(event.target.value))} /></label>
            <label><span className="label">Incremento (s)</span><input className="field" type="number" min={0} max={60} value={incSec} onChange={(event) => setIncSec(Number(event.target.value))} /></label>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-xs uppercase tracking-wider text-ivory/50">{group}</span>
                {TIME_PRESETS.filter((item) => item.group === group).map((item) => (
                  <button key={item.id} type="button" className={`btn ${preset === item.id ? "btn-gold" : "btn-ghost"}`} onClick={() => setPreset(item.id)}>{item.label}</button>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
      {mode === "bot" ? (
        <section className="card space-y-4 p-5">
          <p className="muted text-sm">O rating ao lado do nome é a força aproximada do adversário. A partida entra no histórico e não altera o seu rating.</p>
          <div className="flex flex-wrap gap-2">
            {([
              ["todos", "Todos"],
              ["iniciante", "Até 800"],
              ["clube", "1000–1400"],
              ["forte", "1600–2000"],
              ["elite", "2200+"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={`btn ${band === id ? "btn-gold" : "btn-ghost"}`} onClick={() => setBand(id)}>{label}</button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {BOT_LEVELS.filter((bot) => {
              if (band === "iniciante") return bot.elo <= 800;
              if (band === "clube") return bot.elo >= 1000 && bot.elo <= 1400;
              if (band === "forte") return bot.elo >= 1600 && bot.elo <= 2000;
              if (band === "elite") return bot.elo >= 2200;
              return true;
            }).map((bot) => (
              <button key={bot.id} type="button" className={`card flex items-start gap-3 p-3 text-left ${level === bot.id ? "border-gold/60" : ""}`} onClick={() => setLevel(bot.id)}>
                <Avatar avatar={bot.avatar} name={bot.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="break-words">{bot.name}</span>
                    <span className="shrink-0 text-gold-2">{bot.elo}</span>
                  </span>
                  <span className="muted block text-xs leading-relaxed break-words">{bot.title} · {bot.blurb}</span>
                  <span className="mt-2 block h-1 bg-ink" aria-hidden="true">
                    <span className="block h-1 bg-gold/70" style={{ width: `${Math.round((bot.elo / 2400) * 100)}%` }} />
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {BOT_STYLES.map((item) => (
              <button key={item.id} type="button" title={item.blurb} className={`btn ${style === item.id ? "btn-gold" : "btn-ghost"}`} onClick={() => setStyle(item.id)}>{item.name}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["white", "black", "random"] as const).map((item) => (
              <button key={item} type="button" className={`btn ${color === item ? "btn-gold" : "btn-ghost"}`} onClick={() => setColor(item)}>
                {item === "white" ? "Brancas" : item === "black" ? "Pretas" : "Cor aleatória"}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-gold" disabled={pending} onClick={startBot}>{pending ? "Preparando…" : "Jogar contra o bot"}</button>
        </section>
      ) : null}
      {mode === "online" ? (
        <section className="card space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rated} onChange={(event) => setRated(event.target.checked)} /> Partida classificada</label>
          <p className="muted text-sm">O pareamento exige o mesmo ritmo. Partidas com menos de um lance de cada lado são anuladas e não mudam o rating. O resultado é calculado no servidor.</p>
          {waiting ? (
            <div className="flex items-center gap-3">
              <p>Procurando adversário para {custom ? `${baseMin}+${incSec}` : preset}…</p>
              <button type="button" className="btn btn-ghost" onClick={async () => { await api("/api/games/seek", { method: "DELETE" }); setWaiting(false); }}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn btn-gold" disabled={pending} onClick={seek}>{pending ? "Buscando…" : "Entrar na fila"}</button>
          )}
        </section>
      ) : null}
      {mode === "amigo" ? (
        <section className="card space-y-4 p-5">
          <label className="block"><span className="label">ID numérico do amigo</span><input className="field" value={friendId} onChange={(event) => setFriendId(event.target.value)} placeholder="Visível no perfil interno da lista de amigos" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rated} onChange={(event) => setRated(event.target.checked)} /> Valendo rating</label>
          <button
            type="button"
            className="btn btn-gold"
            onClick={async () => {
              setError("");
              try {
                const data = await api<{ game: GameView }>("/api/games/invite", {
                  method: "POST",
                  body: JSON.stringify({ ...time, rated, friendId: Number(friendId), color: "random" }),
                });
                navigate(`/jogar/partida/${data.game.id}`);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Convite recusado.");
              }
            }}
          >
            Convidar
          </button>
          <p className="muted text-sm">Na página Amigos, o convite também pode ser enviado direto do perfil do amigo.</p>
        </section>
      ) : null}
      {mode === "sala" ? (
        <section className="card space-y-4 p-5">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rated} onChange={(event) => setRated(event.target.checked)} /> Valendo rating</label>
          <button
            type="button"
            className="btn btn-gold"
            onClick={async () => {
              setError("");
              try {
                const data = await api<{ game: GameView }>("/api/games/invite", {
                  method: "POST",
                  body: JSON.stringify({ ...time, rated, color: "random" }),
                });
                navigate(`/jogar/partida/${data.game.id}`);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Não foi possível abrir a sala.");
              }
            }}
          >
            Criar link
          </button>
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setError("");
              try {
                const data = await api<{ game: GameView }>("/api/games/join", { method: "POST", body: JSON.stringify({ code }) });
                navigate(`/jogar/partida/${data.game.id}`);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : "Código inválido.");
              }
            }}
          >
            <input className="field" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Código da sala" aria-label="Código da sala" />
            <button className="btn btn-ghost">Entrar</button>
          </form>
        </section>
      ) : null}
      {error ? <p className="text-danger" role="alert">{error}</p> : null}
      <p className="muted text-xs">Ritmo selecionado: {custom ? `${baseMin}+${incSec}` : formatControl(TIME_PRESETS.find((item) => item.id === preset)?.baseMs ?? 0, TIME_PRESETS.find((item) => item.id === preset)?.incMs ?? 0)}</p>
    </div>
  );
}
