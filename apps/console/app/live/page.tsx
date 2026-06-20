"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Bike, CalendarCheck, Gauge, Radio, Wallet, type LucideIcon } from "lucide-react";
import {
  colors,
  formatRp,
  STATUS_LABELS,
  type ActivityEvent,
  type ActivityKind,
  type BookingStatus,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { AppBadge, Card, ErrorState, Loading, PageHeader, SetupNotice } from "@/components/ui";

const TONE_COLOR: Record<NonNullable<ActivityEvent["tone"]>, string> = {
  primary: colors.primary,
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
};

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  booking: CalendarCheck,
  ride: Bike,
  score: Gauge,
  payment: Wallet,
  notification: Bell,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  booking: "Booking",
  ride: "Ride",
  score: "MotoScore",
  payment: "Pembayaran",
  notification: "Notifikasi",
};

const PAYMENT_LABEL: Record<string, string> = {
  deposit: "Deposit booking",
  final: "Pelunasan servis",
  sparepart: "Sparepart",
  bill: "Tagihan",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hr lalu`;
}

type Named = { name: string } | null;

export default function LivePage() {
  const supabase = getSupabase();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [bRes, rRes, pRes, sRes, nRes] = await Promise.all([
      supabase.from("v_bookings_recent").select("*").limit(20),
      supabase.from("rides").select("id, distance_m, eco_score, flagged, flag_reason, status, created_at, users(name)").order("created_at", { ascending: false }).limit(12),
      supabase.from("payments").select("id, type, amount, astrapay_ref, created_at, users(name)").order("created_at", { ascending: false }).limit(15),
      supabase.from("motoscore_history").select("id, delta, reason, created_at, users(name)").order("created_at", { ascending: false }).limit(15),
      supabase.from("notifications").select("id, type, title, body, created_at, users(name)").order("created_at", { ascending: false }).limit(15),
    ]);

    const firstErr = bRes.error ?? rRes.error ?? pRes.error ?? sRes.error ?? nRes.error;
    if (firstErr) {
      setError(firstErr.message);
      setLoading(false);
      return;
    }
    setError(null);

    const merged: ActivityEvent[] = [];

    for (const b of (bRes.data ?? []) as unknown as {
      id: string; customer: string; workshop: string; service: string;
      status: BookingStatus; total_amount: number | null; created_at: string;
    }[]) {
      merged.push({
        id: `b-${b.id}`,
        kind: "booking",
        at: b.created_at,
        title: `${b.customer} · ${b.workshop}`,
        detail: `${b.service} — ${STATUS_LABELS[b.status] ?? b.status}`,
        amount: b.total_amount,
        tone: b.status === "completed" ? "accent" : b.status === "cancelled" ? "danger" : "primary",
        // New booking = consumer creates it; status advances = the workshop (partner) acts.
        app: b.status === "pending" || b.status === "cancelled" ? "consumer" : "partner",
      });
    }
    for (const r of (rRes.data ?? []) as unknown as {
      id: string; distance_m: number; eco_score: number | null; flagged: boolean;
      flag_reason: string | null; status: string; created_at: string; users: Named;
    }[]) {
      merged.push({
        id: `r-${r.id}`,
        kind: "ride",
        at: r.created_at,
        title: `${r.users?.name ?? "Rider"} — ${(r.distance_m / 1000).toFixed(1)} km`,
        detail: r.flagged
          ? `Ditandai anti-cheat: ${r.flag_reason}`
          : `Eco ${r.eco_score ?? "—"}/100 · ${r.status}`,
        tone: r.flagged ? "danger" : "accent",
        app: "consumer",
      });
    }
    for (const p of (pRes.data ?? []) as unknown as {
      id: string; type: string; amount: number; astrapay_ref: string | null; created_at: string; users: Named;
    }[]) {
      const label = PAYMENT_LABEL[p.type] ?? p.type;
      merged.push({
        id: `p-${p.id}`,
        kind: "payment",
        at: p.created_at,
        title: `${p.users?.name ?? "Pengguna"}`,
        // Show the AstraPay referenceNo when present — live debits carry it.
        detail: p.astrapay_ref ? `${label} · ${p.astrapay_ref}` : label,
        amount: p.amount,
        tone: "accent",
        app: "consumer",
      });
    }
    for (const s of (sRes.data ?? []) as unknown as {
      id: string; delta: number; reason: string; created_at: string; users: Named;
    }[]) {
      merged.push({
        id: `s-${s.id}`,
        kind: "score",
        at: s.created_at,
        title: `${s.users?.name ?? "Pengguna"} ${s.delta >= 0 ? "+" : ""}${s.delta} MotoScore`,
        detail: s.reason,
        tone: s.delta >= 0 ? "accent" : "danger",
        app: "system",
      });
    }
    for (const n of (nRes.data ?? []) as unknown as {
      id: string; type: string; title: string; body: string; created_at: string; users: Named;
    }[]) {
      merged.push({
        id: `n-${n.id}`,
        kind: "notification",
        at: n.created_at,
        title: n.title,
        detail: n.body,
        tone: n.type === "maintenance" ? "warning" : "primary",
        app: "system",
      });
    }

    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const top = merged.slice(0, 60);

    // Mark events not seen before as fresh (skip the very first load).
    if (!firstLoad.current) {
      const added = top.filter((e) => !seenRef.current.has(e.id)).map((e) => e.id);
      if (added.length) {
        setFreshIds(new Set(added));
        setTimeout(() => setFreshIds(new Set()), 3000);
      }
    }
    firstLoad.current = false;
    seenRef.current = new Set(top.map((e) => e.id));
    setEvents(top);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    load();
    // All published tables that feed the stream; payments arrive via the poll.
    const channel = supabase
      .channel("console-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "motoscore" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    const poll = setInterval(load, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, load]);

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Radio size={22} />}
        title="Live Ops"
        subtitle="Aliran aktivitas lintas-app secara real-time — booking, ride, skor, pembayaran."
        action={
          <span className="flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent" />
            {events.length} peristiwa
          </span>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <Loading label="Memuat aktivitas…" />
      ) : (
      <Card>
        {events.length === 0 ? (
          <p className="py-16 text-center text-muted-soft">Menunggu aktivitas…</p>
        ) : (
          <ol className="relative ml-2 border-l border-border">
            {events.map((e) => {
              const Icon = KIND_ICON[e.kind];
              const color = TONE_COLOR[e.tone ?? "primary"];
              const fresh = freshIds.has(e.id);
              return (
                <li
                  key={e.id}
                  className={`relative mb-1 rounded-xl py-3 pl-8 pr-3 transition-colors duration-700 ${
                    fresh ? "bg-accent-soft" : ""
                  }`}
                >
                  <span
                    className="absolute -left-[13px] top-4 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card"
                    style={{ backgroundColor: `${color}1a`, color }}
                  >
                    <Icon size={13} />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {e.title}
                        {fresh && (
                          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                            baru
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-muted">{e.detail}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {e.amount != null && (
                        <p className="text-sm font-semibold tabular-nums" style={{ color }}>
                          {formatRp(e.amount)}
                        </p>
                      )}
                      <p className="text-xs text-muted-soft">{relTime(e.at)}</p>
                      <div className="mt-1 flex items-center justify-end gap-1.5">
                        {e.app && <AppBadge app={e.app} />}
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-soft">
                          {KIND_LABEL[e.kind]}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
      )}
    </div>
  );
}
