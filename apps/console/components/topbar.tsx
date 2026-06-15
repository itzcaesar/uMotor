"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function Topbar() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleString("id-ID", {
          weekday: "long",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/70 px-8 backdrop-blur">
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">uMotor</span>
        <span className="text-muted-soft">/</span>
        <span>Console</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted md:inline tabular-nums">{now}</span>
        <Link
          href="/copilot"
          aria-label="Buka uMotor AI Copilot"
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary to-[#1769d6] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
          <Sparkles size={13} />
          uMotor AI
        </Link>
        <span className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent" />
          DEMO
        </span>
      </div>
    </header>
  );
}
