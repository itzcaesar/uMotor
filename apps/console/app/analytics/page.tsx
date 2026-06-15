"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, Receipt, Wallet, CheckCircle2, BarChart3 } from "lucide-react";
import {
  colors,
  formatRp,
  STATUS_LABELS,
  statusColor,
  type BookingStatus,
  type PaymentType,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, ChartTooltip, ErrorState, KpiCard, Loading, PageHeader, SectionHeader, SetupNotice } from "@/components/ui";

const nf = new Intl.NumberFormat("id-ID");

const REVENUE_META: { key: PaymentType; label: string; color: string }[] = [
  { key: "deposit", label: "Deposit", color: colors.primary },
  { key: "final", label: "Pelunasan", color: colors.accent },
  { key: "sparepart", label: "Sparepart", color: colors.warning },
  { key: "bill", label: "Tagihan", color: "#7048e8" },
];

// Demo funnel order (the booking lifecycle), so the bars read top→bottom.
const FUNNEL: BookingStatus[] = ["pending", "confirmed", "checked_in", "in_progress", "completed", "cancelled"];

type Payment = { type: PaymentType; amount: number; created_at: string };
type Booking = { status: BookingStatus; service_id: string; total_amount: number | null };
type Service = { id: string; name: string };
type WorkshopRow = { name: string; type: string; rating: number; bookings: { count: number }[] };

/** Local YYYY-MM-DD day key (not UTC toISOString) so the day strip never shifts. */
function dayKey(ts: string) {
  return new Date(ts).toLocaleDateString("en-CA"); // YYYY-MM-DD in local tz
}

export default function AnalyticsPage() {
  const supabase = getSupabase();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [pRes, bRes, sRes, wRes] = await Promise.all([
      supabase.from("payments").select("type, amount, created_at").limit(5000),
      supabase.from("bookings").select("status, service_id, total_amount").limit(5000),
      supabase.from("services").select("id, name"),
      supabase.from("workshops").select("name, type, rating, bookings(count)"),
    ]);
    const firstErr = pRes.error ?? bRes.error ?? sRes.error ?? wRes.error;
    if (firstErr) setError(firstErr.message);
    else setError(null);
    if (pRes.data) setPayments(pRes.data as Payment[]);
    if (bRes.data) setBookings(bRes.data as Booking[]);
    if (sRes.data) setServices(sRes.data as Service[]);
    if (wRes.data) setWorkshops(wRes.data as WorkshopRow[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    load();
    const channel = supabase
      .channel("console-analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    const poll = setInterval(load, 20000); // payments aren't realtime-published
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, load]);

  const gmv = useMemo(() => payments.reduce((s, p) => s + p.amount, 0), [payments]);

  // Revenue trend — last 30 local days, stacked by payment type.
  const trend = useMemo(() => {
    const days: string[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }
    const map = new Map<string, Record<string, number>>();
    days.forEach((d) => map.set(d, { deposit: 0, final: 0, sparepart: 0, bill: 0 }));
    for (const p of payments) {
      const k = dayKey(p.created_at);
      const row = map.get(k);
      if (row) row[p.type] = (row[p.type] ?? 0) + p.amount;
    }
    return days.map((d) => ({ day: d.slice(5), ...map.get(d)! }));
  }, [payments]);

  const funnel = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of bookings) counts.set(b.status, (counts.get(b.status) ?? 0) + 1);
    return FUNNEL.map((s) => ({ status: s, label: STATUS_LABELS[s], n: counts.get(s) ?? 0 }));
  }, [bookings]);

  const completionRate = useMemo(() => {
    const done = bookings.filter((b) => b.status === "completed").length;
    return bookings.length ? Math.round((done / bookings.length) * 100) : 0;
  }, [bookings]);

  const avgTicket = useMemo(() => {
    const done = bookings.filter((b) => b.status === "completed" && b.total_amount != null);
    if (!done.length) return 0;
    return Math.round(done.reduce((s, b) => s + (b.total_amount ?? 0), 0) / done.length);
  }, [bookings]);

  const serviceMix = useMemo(() => {
    const nameById = new Map(services.map((s) => [s.id, s.name]));
    const counts = new Map<string, number>();
    for (const b of bookings) {
      const name = nameById.get(b.service_id) ?? "Lainnya";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  }, [bookings, services]);

  const leaderboard = useMemo(
    () =>
      workshops
        .map((w) => ({ name: w.name, type: w.type, rating: Number(w.rating), n: w.bookings[0]?.count ?? 0 }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10),
    [workshops],
  );

  if (!supabase) return <SetupNotice />;

  const maxFunnel = Math.max(1, ...funnel.map((f) => f.n));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<BarChart3 size={22} />}
        title="Analytics"
        subtitle="Pendapatan, funnel booking, dan performa bengkel — agregat real-time."
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <Loading label="Memuat analitik…" />
      ) : (
      <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="GMV total" value={formatRp(gmv)} icon={<Wallet size={18} />} accent="warning" />
        <KpiCard
          label="Total booking"
          value={nf.format(bookings.length)}
          icon={<Receipt size={18} />}
          accent="primary"
        />
        <KpiCard
          label="Tingkat selesai"
          value={`${completionRate}%`}
          icon={<CheckCircle2 size={18} />}
          accent="accent"
        />
        <KpiCard label="Rata-rata transaksi" value={formatRp(avgTicket)} icon={<TrendingUp size={18} />} accent="primary" />
      </div>

      <Card>
        <SectionHeader title="Tren pendapatan" subtitle="30 hari terakhir — ditumpuk per sumber" />
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={trend} margin={{ left: 8, right: 8, top: 4 }}>
            <defs>
              {REVENUE_META.map((r) => (
                <linearGradient key={r.key} id={`area-${r.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={r.color} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={r.color} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
            <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} stroke="#98a2b3" minTickGap={24} />
            <YAxis
              fontSize={11}
              tickLine={false}
              axisLine={false}
              stroke="#98a2b3"
              width={56}
              tickFormatter={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${Math.round(v / 1000)}rb`)}
            />
            <Tooltip
              formatter={(value) => formatRp(Number(value))}
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e9f0", fontSize: 13 }}
            />
            {REVENUE_META.map((r) => (
              <Area
                key={r.key}
                type="monotone"
                dataKey={r.key}
                name={r.label}
                stackId="rev"
                stroke={r.color}
                strokeWidth={1.5}
                fill={`url(#area-${r.key})`}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          {REVENUE_META.map((r) => (
            <span key={r.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: r.color }} />
              {r.label}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Funnel booking" subtitle="Sebaran status seluruh booking" />
          <div className="flex flex-col gap-3 pt-1">
            {funnel.map((f) => (
              <div key={f.status} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm text-muted">{f.label}</span>
                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-background">
                  <div
                    className="flex h-full items-center justify-end rounded-lg px-2 text-xs font-semibold text-white transition-all"
                    style={{
                      width: `${Math.max(6, (f.n / maxFunnel) * 100)}%`,
                      backgroundColor: statusColor[f.status],
                    }}
                  >
                    {f.n}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Layanan terpopuler" subtitle="Jumlah booking per jenis servis" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={serviceMix} layout="vertical" margin={{ left: 24, right: 16, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef1f6" />
              <XAxis type="number" allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} stroke="#98a2b3" />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                stroke="#475467"
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(14,77,164,0.06)" }} />
              <Bar dataKey="n" name="Booking" radius={[0, 6, 6, 0]} maxBarSize={26}>
                {serviceMix.map((_, i) => (
                  <Cell key={i} fill={REVENUE_META[i % REVENUE_META.length].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-3">
          <SectionHeader title="Papan peringkat bengkel" subtitle="10 bengkel teratas berdasarkan volume booking" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="bg-background/80 text-xs uppercase tracking-wider text-muted-soft">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-semibold">#</th>
                <th className="px-5 py-3 font-semibold">Bengkel</th>
                <th className="px-5 py-3 font-semibold">Tipe</th>
                <th className="px-5 py-3 font-semibold">Rating</th>
                <th className="px-5 py-3 text-right font-semibold">Booking</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((w, i) => (
                <tr key={w.name} className="border-b border-border/60 last:border-0 hover:bg-primary-soft/40">
                  <td className="px-5 py-3 font-bold tabular-nums text-muted-soft">{i + 1}</td>
                  <td className="px-5 py-3 font-medium">{w.name}</td>
                  <td className="px-5 py-3">
                    {w.type === "ahass" ? (
                      <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">AHASS</span>
                    ) : (
                      <span className="text-muted">Independen</span>
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums">★ {w.rating.toFixed(1)}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{nf.format(w.n)}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted-soft">
                    Belum ada data bengkel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}
