"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, X, User } from "lucide-react";

type Role = "user" | "assistant";
interface Msg {
  role: Role;
  content: string;
}

const SUGGESTIONS = [
  "Ringkas kesehatan platform",
  "Bengkel mana paling ramai?",
  "Bagaimana sebaran MotoScore?",
  "Pendapatan terbesar dari sumber apa?",
  "Ada indikasi kecurangan di ride tracking?",
];

const GREETING =
  "Halo! Saya **uMotor AI**, analis ops kamu. Tanya apa saja soal pendapatan, bengkel, MotoScore, booking, ride, atau pengguna — saya jawab dari data live.";

/** Minimal markdown: **bold**, bullets (•/-/*), and line breaks. No external dep. */
function renderRich(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const bulletMatch = /^\s*[•\-*]\s+(.*)$/.exec(line);
    const content = bulletMatch ? bulletMatch[1] : line;
    const parts = content.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).filter(Boolean);
    const rendered = parts.map((p, j) => {
      if (p.startsWith("**") && p.endsWith("**"))
        return (
          <strong key={j} className="font-semibold text-foreground">
            {p.slice(2, -2)}
          </strong>
        );
      if (p.startsWith("_") && p.endsWith("_"))
        return (
          <em key={j} className="text-muted-soft">
            {p.slice(1, -1)}
          </em>
        );
      return <span key={j}>{p}</span>;
    });
    if (bulletMatch)
      return (
        <div key={i} className="flex gap-2 pl-1">
          <span className="text-primary">•</span>
          <span>{rendered}</span>
        </div>
      );
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return <div key={i}>{rendered}</div>;
  });
}

export function CopilotChat({ compact = false }: { compact?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      const history = [...messages, { role: "user" as const, content: q }];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        setMode(res.headers.get("X-Copilot-Mode"));
        if (!res.body) throw new Error("no body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
        }
        if (!acc) {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: "Maaf, tidak ada jawaban. Coba lagi." };
            return copy;
          });
        }
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Maaf, ada gangguan koneksi ke uMotor AI. Coba lagi.",
          };
          return copy;
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  return (
    <div
      className={`flex min-h-0 flex-col ${
        compact ? "h-[min(10rem,calc(100dvh-7rem))]" : "h-[calc(100vh-20rem)]"
      }`}
    >
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-1 py-2">
        <div className="space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  m.role === "user" ? "bg-primary text-white" : "bg-accent-soft text-accent"
                }`}
              >
                {m.role === "user" ? <User size={15} /> : <Bot size={15} />}
              </span>
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-primary text-white"
                    : "border border-border bg-background text-foreground"
                }`}
              >
                {m.content ? (
                  <div className="space-y-0.5">{renderRich(m.content)}</div>
                ) : (
                  <span className="inline-flex gap-1">
                    <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 px-1 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-border pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tanya uMotor AI…"
          disabled={busy}
          className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-opacity disabled:opacity-40"
          aria-label="Kirim"
        >
          <Send size={17} />
        </button>
      </form>
      <p className="mt-2 px-1 text-[11px] text-muted-soft">
        {mode === "local"
          ? "Mode lokal — analisis deterministik dari data live uMotor."
          : "uMotor AI · grounded pada data live uMotor."}
      </p>
    </div>
  );
}

function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-soft"
      style={{ animationDelay: delay }}
    />
  );
}

export function CopilotWidget() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-[#1769d6] px-5 py-3.5 font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-105"
        >
          <Sparkles size={18} className="transition-transform group-hover:rotate-12" />
          Tanya uMotor AI
        </button>
      )}
      {open && (
        <div className="fixed bottom-6 right-6 z-40 flex max-h-[calc(100dvh-3rem)] w-[26rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#1769d6] text-white">
                <Sparkles size={17} />
              </span>
              <div>
                <p className="text-sm font-bold leading-none">uMotor AI</p>
                <p className="mt-1 text-[11px] text-muted-soft">Analis ops · data live</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-soft transition-colors hover:bg-background hover:text-foreground"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1">
            <CopilotChat compact />
          </div>
        </div>
      )}
    </>
  );
}
