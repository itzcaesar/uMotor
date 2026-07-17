"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Bike,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Gauge,
  RefreshCw,
  Radio,
  Search,
  ShieldAlert,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  colors,
  formatRp,
  STATUS_LABELS,
  type ActivityEvent,
  type ActivityKind,
  type BookingStatus,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { AppBadge, Card, ErrorState, Loading, PageHeader, SectionHeader, SetupNotice } from "@/components/ui";

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

type AppFilter = "all" | "consumer" | "partner" | "system";
type KindFilter = "all" | ActivityKind;
type RealtimeState = "connecting" | "connected" | "degraded";

type LiveMetrics = {
  bookingsOpen: number;
  bookingsToday: number;
  activeRides: number;
  flaggedRides: number;
  paymentsToday: number;
  paymentsAmountToday: number;
  unreadNotifications: number;
  activity15m: number;
};

const EMPTY_METRICS: LiveMetrics = {
  bookingsOpen: 0,
  bookingsToday: 0,
  activeRides: 0,
  flaggedRides: 0,
  paymentsToday: 0,
  paymentsAmountToday: 0,
  unreadNotifications: 0,
  activity15m: 0,
};

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

export default function LivePage() {
  const supabase = getSupabase();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [appFilter, setAppFilter] = useState<AppFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [search, setSearch] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (!supabase) return;
    setRefreshing(true);
    const [bRes, bStatsRes, rRes, pRes, sRes, nRes] = await Promise.all([
      supabase.from("v_bookings_recent").select("*").limit(40),
      supabase.from("bookings").select("status, created_at").limit(5000),
      supabase.from("rides").select("id, distance_m, eco_score, flagged, flag_reason, status, created_at, users(name)").order("created_at", { ascending: false }).limit(5000),
      supabase.from("payments").select("id, type, amount, astrapay_ref, status, created_at, users(name)").order("created_at", { ascending: false }).limit(5000),
      supabase.from("motoscore_history").select("id, delta, reason, created_at, users(name)").order("created_at", { ascending: false }).limit(15),
      supabase.from("notifications").select("id, type, title, body, read, created_at, users(name)").order("created_at", { ascending: false }).limit(5000),
    ]);

    const firstErr = bRes.error ?? bStatsRes.error ?? rRes.error ?? pRes.error ?? sRes.error ?? nRes.error;
    if (firstErr) {
      setError(firstErr.message);
      setLoading(false);
      setRefreshing(false);
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
      id: string; type: string; title: string; body: string; read: boolean; created_at: string; users: Named;
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
    const today = dayKey(new Date().toISOString());
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const bookingRows = (bStatsRes.data ?? []) as { status: BookingStatus; created_at: string }[];
    const rideRows = (rRes.data ?? []) as { status: string; flagged: boolean; created_at: string }[];
    const paymentRows = (pRes.data ?? []) as { amount: number; status: string; created_at: string }[];
    const notificationRows = (nRes.data ?? []) as { read: boolean; created_at: string }[];
    const openStatuses: BookingStatus[] = ["pending", "confirmed", "checked_in", "in_progress"];
    setMetrics({
      bookingsOpen: bookingRows.filter((b) => openStatuses.includes(b.status)).length,
      bookingsToday: bookingRows.filter((b) => dayKey(b.created_at) === today).length,
      activeRides: rideRows.filter((r) => r.status === "active").length,
      flaggedRides: rideRows.filter((r) => r.flagged).length,
      paymentsToday: paymentRows.filter((p) => p.status === "success" && dayKey(p.created_at) === today).length,
      paymentsAmountToday: paymentRows
        .filter((p) => p.status === "success" && dayKey(p.created_at) === today)
        .reduce((sum, p) => sum + p.amount, 0),
      unreadNotifications: notificationRows.filter((n) => !n.read).length,
      activity15m: top.filter((e) => new Date(e.at).getTime() >= fifteenMinutesAgo).length,
    });
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    // Defer the first fetch one tick so the subscription is established without
    // triggering React's synchronous setState-in-effect warning.
    const initialLoad = window.setTimeout(() => void load(), 0);
    // All published tables that feed the stream; payments arrive via the poll.
    const channel = supabase
      .channel("console-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "motoscore" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe((status) => {
        setRealtimeState(status === "SUBSCRIBED" ? "connected" : status === "CHANNEL_ERROR" || status === "TIMED_OUT" ? "degraded" : "connecting");
      });
    const poll = setInterval(load, 15000);
    return () => {
      window.clearTimeout(initialLoad);
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, load]);

  const filteredEvents = events.filter((event) => {
    if (appFilter !== "all" && event.app !== appFilter) return false;
    if (kindFilter !== "all" && event.kind !== kindFilter) return false;
    if (search.trim()) {
      const haystack = `${event.title} ${event.detail}`.toLowerCase();
      if (!haystack.includes(search.trim().toLowerCase())) return false;
    }
    return true;
  });

  const appActivity = (app: AppFilter) =>
    app === "all" ? events.length : events.filter((event) => event.app === app).length;

  const signalCards = [
    {
      label: "Booking terbuka",
      value: metrics.bookingsOpen,
      detail: `${metrics.bookingsToday} masuk hari ini`,
      icon: CalendarCheck,
      tone: metrics.bookingsOpen > 0 ? "primary" : "accent",
    },
    {
      label: "Ride aktif",
      value: metrics.activeRides,
      detail: "sedang terlacak",
      icon: Activity,
      tone: "accent",
    },
    {
      label: "Perlu perhatian",
      value: metrics.flaggedRides + metrics.unreadNotifications,
      detail: `${metrics.flaggedRides} anti-cheat · ${metrics.unreadNotifications} notifikasi`,
      icon: ShieldAlert,
      tone: metrics.flaggedRides > 0 ? "danger" : "warning",
    },
  ] as const;

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
        <>
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-[#082f67] via-primary to-[#1769d6] p-6 text-white shadow-[0_18px_45px_-20px_rgba(14,77,164,0.7)]">
            <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                  <span className="live-dot h-2 w-2 rounded-full bg-accent" />
                  Command center · realtime
                </p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">Apa yang terjadi di uMotor sekarang?</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                  Pantau denyut transaksi, ride yang sedang berjalan, dan sinyal risiko dari tiga aplikasi dalam satu layar.
                </p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
                <p className="text-xs text-blue-100">Aktivitas 15 menit</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{metrics.activity15m}</p>
                <p className="mt-1 text-xs text-blue-100">{lastUpdated ? `update ${lastUpdated.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "menunggu data"}</p>
              </div>
            </div>
            <div className="relative mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
              {signalCards.map((signal) => {
                const SignalIcon = signal.icon;
                const tone = signal.tone === "danger" ? "text-[#ffcfce]" : signal.tone === "warning" ? "text-[#ffe0a6]" : signal.tone === "accent" ? "text-[#b8f4d8]" : "text-white";
                return (
                  <div key={signal.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-3.5 py-3 backdrop-blur-sm">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15"><SignalIcon size={17} /></span>
                    <div className="min-w-0">
                      <p className="text-xs text-blue-100">{signal.label}</p>
                      <p className={`text-xl font-bold tabular-nums ${tone}`}>{signal.value}</p>
                      <p className="truncate text-[11px] text-blue-100">{signal.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.8fr)]">
            <Card className="min-w-0">
              <SectionHeader
                title="Activity stream"
                subtitle={`${filteredEvents.length} dari ${events.length} peristiwa · refresh otomatis tiap 15 detik`}
                action={
                  <button
                    onClick={() => load()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary disabled:cursor-wait disabled:opacity-60"
                  >
                    <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                    Refresh
                  </button>
                }
              />
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(["all", "consumer", "partner", "system"] as AppFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setAppFilter(filter)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${appFilter === filter ? "bg-primary text-white shadow-sm" : "border border-border bg-card text-muted hover:bg-primary-soft hover:text-primary"}`}
                    >
                      {filter === "all" ? "Semua" : filter === "consumer" ? "Konsumen" : filter === "partner" ? "Mitra" : "Sistem"}
                      <span className="ml-1 opacity-70">{appActivity(filter)}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["all", "booking", "ride", "payment", "score", "notification"] as KindFilter[]).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setKindFilter(filter)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${kindFilter === filter ? "bg-foreground text-white" : "text-muted hover:bg-card hover:text-foreground"}`}
                      >
                        {filter === "all" ? "Semua tipe" : KIND_LABEL[filter as ActivityKind]}
                      </button>
                    ))}
                  </div>
                  <label className="flex min-w-44 items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-muted focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                    <Search size={14} className="shrink-0 text-muted-soft" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari aktivitas…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-soft" />
                  </label>
                </div>
              </div>
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 py-16 text-center">
                  <Search size={28} className="text-muted-soft opacity-60" />
                  <p className="text-sm font-medium text-muted">Tidak ada aktivitas yang cocok.</p>
                  <button onClick={() => { setAppFilter("all"); setKindFilter("all"); setSearch(""); }} className="text-xs font-semibold text-primary hover:underline">Reset filter</button>
                </div>
              ) : (
                <ol className="relative ml-2 border-l border-border">
                  {filteredEvents.map((e) => {
                    const Icon = KIND_ICON[e.kind];
                    const color = TONE_COLOR[e.tone ?? "primary"];
                    const fresh = freshIds.has(e.id);
                    return (
                      <li key={e.id} className={`relative mb-1 rounded-xl py-3 pl-8 pr-3 transition-colors duration-700 ${fresh ? "bg-accent-soft" : ""}`}>
                        <span className="absolute -left-[13px] top-4 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card" style={{ backgroundColor: `${color}1a`, color }}>
                          <Icon size={13} />
                        </span>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-semibold">
                              {e.title}
                              {fresh && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">baru</span>}
                            </p>
                            <p className="mt-0.5 truncate text-sm text-muted">{e.detail}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {e.amount != null && <p className="text-sm font-semibold tabular-nums" style={{ color }}>{formatRp(e.amount)}</p>}
                            <p className="text-xs text-muted-soft">{relTime(e.at)}</p>
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                              {e.app && <AppBadge app={e.app} />}
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-soft">{KIND_LABEL[e.kind]}</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
            <div className="flex flex-col gap-4">
              <Card>
                <SectionHeader title="Health snapshot" subtitle="Sinyal operasional dari data live" />
                <div className="space-y-3">
                  <HealthRow
                    icon={<CheckCircle2 size={16} />}
                    label="Realtime channel"
                    value={realtimeState === "connected" ? "Terhubung" : realtimeState === "degraded" ? "Polling aktif" : "Menghubungkan"}
                    tone={realtimeState === "degraded" ? "warning" : realtimeState === "connected" ? "accent" : "primary"}
                  />
                  <HealthRow icon={<Zap size={16} />} label="Pembayaran hari ini" value={`${metrics.paymentsToday} · ${formatRp(metrics.paymentsAmountToday)}`} tone="primary" />
                  <HealthRow icon={<Clock3 size={16} />} label="Booking terbuka" value={`${metrics.bookingsOpen} menunggu proses`} tone="warning" />
                  <HealthRow icon={<ShieldAlert size={16} />} label="Anti-cheat flags" value={`${metrics.flaggedRides} ride ditandai`} tone={metrics.flaggedRides ? "danger" : "accent"} />
                </div>
                <div className="mt-4 rounded-xl bg-background px-3 py-2.5 text-xs text-muted">
                  <span className="font-semibold text-foreground">Tip demo:</span> buka app Konsumen atau Mitra di tab lain — aktivitas baru akan muncul sebagai <span className="font-semibold text-accent">BARU</span> di sini.
                </div>
              </Card>
              <Card>
                <SectionHeader title="Footprint per aplikasi" subtitle="Peristiwa yang terpantau di stream" />
                <div className="space-y-3">
                  <FootprintRow label="Konsumen" value={appActivity("consumer")} color="#0E4DA4" />
                  <FootprintRow label="Mitra" value={appActivity("partner")} color="#00A86B" />
                  <FootprintRow label="Sistem" value={appActivity("system")} color="#7048e8" />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                  <span>Total event tersimpan</span>
                  <span className="font-semibold tabular-nums text-foreground">{events.length}</span>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HealthRow({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "accent" | "primary" | "warning" | "danger" }) {
  const classes = {
    accent: "bg-accent-soft text-accent",
    primary: "bg-primary-soft text-primary",
    warning: "bg-[#fdf3e3] text-warning",
    danger: "bg-danger/10 text-danger",
  } as const;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classes[tone]}`}>{icon}</span>
        <span className="truncate text-sm text-muted">{label}</span>
      </div>
      <span className="shrink-0 text-right text-xs font-semibold text-foreground">{value}</span>
    </div>
  );
}

function FootprintRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="w-16 text-sm text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(6, Math.min(100, value))}%`, backgroundColor: color, opacity: 0.8 }} />
      </div>
      <span className="w-7 text-right text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
