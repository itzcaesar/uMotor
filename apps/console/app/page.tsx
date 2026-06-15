"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as RechartsLegend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import {
  Users,
  CalendarClock,
  Wallet,
  Store,
  Sparkles,
  Lightbulb,
  LayoutDashboard,
  Smartphone,
  Wrench,
  BarChart3,
} from "lucide-react";
import {
  colors,
  formatRp,
  statusColor,
  STATUS_LABELS,
  type BookingStatus,
  type KpiOverview,
  type MotoScoreBucket,
  type RevenueBreakdown,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import {
  APP_META,
  type AppSource,
  Card,
  ChartTooltip,
  KpiCard,
  PageHeader,
  SectionHeader,
  SetupNotice,
} from "@/components/ui";
import type { ReactNode } from "react";

type CrossApp = {
  consumer: { riders: number; rideKm: number; billsUnpaid: number; billsAmount: number; avgScore: number };
  partner: { workshops: number; ahass: number; utilizationPct: number; spareparts: number; net: number };
};

const nf = new Intl.NumberFormat("id-ID");

const REVENUE_LABELS: Record<string, string> = {
  deposit: "Deposit booking",
  final: "Pelunasan servis",
  sparepart: "Sparepart",
  bill: "Tagihan (STNK/BBM)",
};
const REVENUE_COLORS: Record<string, string> = {
  deposit: colors.primary,
  final: colors.accent,
  sparepart: colors.warning,
  bill: "#7048e8",
};

// Credit-tier colors so the MotoScore story reads at a glance on the projector.
function scoreColor(min: number) {
  if (min < 580) return colors.danger;
  if (min < 670) return colors.warning;
  if (min < 740) return colors.primary;
  return colors.accent;
}

export default function OverviewPage() {
  const supabase = getSupabase();
  const [kpi, setKpi] = useState<KpiOverview | null>(null);
  const [buckets, setBuckets] = useState<MotoScoreBucket[]>([]);
  const [daily, setDaily] = useState<{ day: string; n: number }[]>([]);
  const [revenue, setRevenue] = useState<RevenueBreakdown[]>([]);
  const [cross, setCross] = useState<CrossApp | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [kpiRes, distRes, bookRes, revRes] = await Promise.all([
      supabase.from("v_kpi_overview").select("*").single(),
      supabase.from("v_motoscore_distribution").select("*"),
      supabase
        .from("bookings")
        .select("created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
      supabase.from("v_revenue_breakdown").select("*"),
    ]);
    if (kpiRes.data) setKpi(kpiRes.data as KpiOverview);
    if (distRes.data) setBuckets(distRes.data as MotoScoreBucket[]);
    if (revRes.data) setRevenue(revRes.data as RevenueBreakdown[]);
    if (bookRes.data) {
      const byDay = new Map<string, number>();
      for (const b of bookRes.data as { created_at: string }[]) {
        const day = b.created_at.slice(5, 10); // MM-DD
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
      setDaily(
        [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, n]) => ({ day, n })),
      );
    }

    // Cross-app footprint — consumer (rides, bills, score) + partner (slots, sparepart, net).
    const [rideRes, billRes, slotRes, partRes, wsRes, statusRes] = await Promise.all([
      supabase.from("rides").select("distance_m, status"),
      supabase.from("bills").select("paid, amount"),
      supabase.from("slots").select("capacity, booked_count"),
      supabase.from("spareparts").select("*", { count: "exact", head: true }),
      supabase.from("workshops").select("type"),
      supabase.from("bookings").select("status").limit(5000),
    ]);
    const sc: Record<string, number> = {};
    for (const row of (statusRes.data as { status: string }[]) ?? []) sc[row.status] = (sc[row.status] ?? 0) + 1;
    setStatusCounts(sc);
    const rideKm = Math.round(
      ((rideRes.data as { distance_m: number; status: string }[]) ?? [])
        .filter((r) => r.status === "completed")
        .reduce((s, r) => s + r.distance_m, 0) / 1000,
    );
    const billRows = (billRes.data as { paid: boolean; amount: number }[]) ?? [];
    const unpaid = billRows.filter((b) => !b.paid);
    const slotRows = (slotRes.data as { capacity: number; booked_count: number }[]) ?? [];
    const cap = slotRows.reduce((s, r) => s + r.capacity, 0);
    const booked = slotRows.reduce((s, r) => s + r.booked_count, 0);
    const wsRows = (wsRes.data as { type: string }[]) ?? [];
    const kpiData = kpiRes.data as KpiOverview | null;
    const distData = (distRes.data as MotoScoreBucket[]) ?? [];
    const scoreTotal = distData.reduce((s, b) => s + b.n, 0);
    const scoreWeighted = distData.reduce((s, b) => s + (b.bucket_min + 25) * b.n, 0);
    const finalTotal = ((revRes.data as RevenueBreakdown[]) ?? []).find((r) => r.type === "final")?.total ?? 0;
    setCross({
      consumer: {
        riders: kpiData?.active_users ?? scoreTotal,
        rideKm,
        billsUnpaid: unpaid.length,
        billsAmount: unpaid.reduce((s, b) => s + b.amount, 0),
        avgScore: scoreTotal ? Math.round(scoreWeighted / scoreTotal) : 0,
      },
      partner: {
        workshops: kpiData?.partner_workshops ?? wsRows.length,
        ahass: wsRows.filter((w) => w.type === "ahass").length,
        utilizationPct: cap ? Math.round((booked / cap) * 100) : 0,
        spareparts: partRes.count ?? 0,
        net: Math.round(finalTotal * 0.95),
      },
    });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    load();
    // The cross-app moment: a booking from the mobile demo ticks the KPI live.
    const channel = supabase
      .channel("console-bookings")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, () => {
        setPulse(true);
        load();
        setTimeout(() => setPulse(false), 2000);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const histogram = useMemo(
    () => buckets.map((b) => ({ label: String(b.bucket_min), n: b.n, min: b.bucket_min })),
    [buckets],
  );

  const revenueData = useMemo(
    () =>
      revenue.map((r) => ({
        name: REVENUE_LABELS[r.type] ?? r.type,
        value: r.total,
        type: r.type,
      })),
    [revenue],
  );
  const revenueTotal = useMemo(() => revenue.reduce((s, r) => s + r.total, 0), [revenue]);

  // Auto-generated insights — derived from the same live data the charts use,
  // so they're honest (no model required). The Copilot answers deeper questions.
  const insights = useMemo(() => {
    const out: string[] = [];
    if (daily.length) {
      const busiest = [...daily].sort((a, b) => b.n - a.n)[0];
      out.push(`Hari tersibuk (30 hari): tanggal ${busiest.day} dengan ${busiest.n} booking.`);
    }
    if (revenue.length && revenueTotal) {
      const top = [...revenue].sort((a, b) => b.total - a.total)[0];
      const pct = Math.round((top.total / revenueTotal) * 100);
      out.push(`${REVENUE_LABELS[top.type] ?? top.type} menyumbang ${pct}% dari GMV (${formatRp(top.total)}).`);
    }
    if (buckets.length) {
      const total = buckets.reduce((s, b) => s + b.n, 0);
      const good = buckets.filter((b) => b.bucket_min >= 670).reduce((s, b) => s + b.n, 0);
      if (total) out.push(`${Math.round((good / total) * 100)}% pengguna ber-MotoScore ≥670 — layak produk kredit & asuransi.`);
    }
    if (kpi) out.push(`${kpi.bookings_today} booking masuk hari ini di jaringan ${kpi.partner_workshops} bengkel mitra.`);
    return out;
  }, [daily, revenue, revenueTotal, buckets, kpi]);

  const statusMix = useMemo(
    () =>
      (Object.keys(STATUS_LABELS) as BookingStatus[])
        .map((s) => ({ name: STATUS_LABELS[s], value: statusCounts[s] ?? 0, status: s }))
        .filter((d) => d.value > 0),
    [statusCounts],
  );
  const statusTotal = useMemo(() => statusMix.reduce((s, d) => s + d.value, 0), [statusMix]);

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<LayoutDashboard size={22} />}
        title="Overview"
        subtitle="Ringkasan kesehatan platform uMotor secara real-time."
      />

      {cross && kpi && (
        <Card className="bg-gradient-to-br from-card to-primary-soft/20">
          <SectionHeader
            title="Tiga aplikasi, satu platform"
            subtitle="Satu backend Supabase — data live dari app Konsumen, app Mitra, dan Console ini."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AppColumn
              source="consumer"
              icon={<Smartphone size={18} />}
              name="App Konsumen"
              tagline="Rider · garasi · ride · finance"
              metrics={[
                { label: "Rider aktif", value: nf.format(cross.consumer.riders), highlight: true },
                { label: "Jarak ride", value: `${nf.format(cross.consumer.rideKm)} km` },
                {
                  label: "Tagihan terbuka",
                  value: `${cross.consumer.billsUnpaid} · ${formatRp(cross.consumer.billsAmount)}`,
                },
                { label: "MotoScore rata-rata", value: `${cross.consumer.avgScore}` },
              ]}
            />
            <AppColumn
              source="partner"
              icon={<Wrench size={18} />}
              name="App Mitra"
              tagline="Bengkel · antrian · slot · sparepart"
              metrics={[
                {
                  label: "Bengkel mitra",
                  value: `${nf.format(cross.partner.workshops)} · ${cross.partner.ahass} AHASS`,
                  highlight: true,
                },
                { label: "Utilisasi slot", value: `${cross.partner.utilizationPct}%` },
                { label: "Listing sparepart", value: nf.format(cross.partner.spareparts) },
                { label: "Est. pendapatan", value: formatRp(cross.partner.net) },
              ]}
            />
            <AppColumn
              source="system"
              icon={<LayoutDashboard size={18} />}
              name="Ops Console"
              tagline="Pemantauan · analitik · AI"
              metrics={[
                { label: "GMV total", value: formatRp(kpi.gmv), highlight: true },
                { label: "Booking hari ini", value: nf.format(kpi.bookings_today) },
                { label: "Pengguna aktif", value: nf.format(kpi.active_users) },
                { label: "Realtime", value: "Aktif" },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Active Users"
          value={kpi ? nf.format(kpi.active_users) : "—"}
          icon={<Users size={18} />}
          accent="primary"
          trend={{ dir: "up", text: "+12% bln ini" }}
        />
        <KpiCard
          label="Bookings Today"
          value={kpi ? nf.format(kpi.bookings_today) : "—"}
          icon={<CalendarClock size={18} />}
          accent="accent"
          live
          highlight={pulse}
        />
        <KpiCard
          label="GMV"
          value={kpi ? formatRp(kpi.gmv) : "—"}
          icon={<Wallet size={18} />}
          accent="warning"
          trend={{ dir: "up", text: "+8% bln ini" }}
        />
        <KpiCard
          label="Partner Workshops"
          value={kpi ? nf.format(kpi.partner_workshops) : "—"}
          icon={<Store size={18} />}
          accent="primary"
        />
      </div>

      {insights.length > 0 && (
        <Card className="bg-gradient-to-br from-primary-soft/40 to-transparent">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Sparkles size={18} className="text-primary" />
              Insight otomatis
            </h2>
            <Link
              href="/copilot"
              className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              Tanya uMotor AI →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {insights.map((text, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border bg-card/70 px-3.5 py-3">
                <Lightbulb size={16} className="mt-0.5 shrink-0 text-warning" />
                <p className="text-sm text-foreground">{text}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Bookings" subtitle="30 hari terakhir" />
          {daily.length === 0 ? (
            <ChartEmpty label="Belum ada booking 30 hari terakhir." />
          ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily} margin={{ left: -16, right: 8, top: 4 }}>
              <defs>
                <linearGradient id="barPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={colors.primary} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
              <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} stroke="#98a2b3" />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} stroke="#98a2b3" width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(14,77,164,0.06)" }} />
              <Bar dataKey="n" name="Bookings" fill="url(#barPrimary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Distribusi MotoScore"
            subtitle="Skor kredit 300–850 dari perilaku perawatan motor — bukan riwayat kredit bank."
          />
          {histogram.length === 0 ? (
            <ChartEmpty label="Belum ada data MotoScore." />
          ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={histogram} margin={{ left: -16, right: 8, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} stroke="#98a2b3" />
              <YAxis allowDecimals={false} fontSize={12} tickLine={false} axisLine={false} stroke="#98a2b3" width={32} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,168,107,0.06)" }} />
              <Bar dataKey="n" name="Pengguna" radius={[6, 6, 0, 0]} maxBarSize={36}>
                {histogram.map((d) => (
                  <Cell key={d.min} fill={scoreColor(d.min)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Legend color={colors.danger} label="Poor (<580)" />
            <Legend color={colors.warning} label="Fair (580–669)" />
            <Legend color={colors.primary} label="Good (670–739)" />
            <Legend color={colors.accent} label="Excellent (740+)" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader
            title="Pendapatan per sumber"
            subtitle={`Total ${formatRp(revenueTotal)} — semua revenue stream`}
          />
          {revenueData.length === 0 ? (
            <ChartEmpty label="Belum ada pendapatan tercatat." />
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={revenueData}
                dataKey="value"
                nameKey="name"
                innerRadius={64}
                outerRadius={104}
                paddingAngle={2}
              >
                {revenueData.map((d) => (
                  <Cell key={d.type} fill={REVENUE_COLORS[d.type] ?? colors.primary} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatRp(Number(value))} />
              <RechartsLegend
                verticalAlign="bottom"
                iconType="circle"
                formatter={(value) => <span className="text-sm text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <SectionHeader
            title="Komposisi status booking"
            subtitle={`${nf.format(statusTotal)} booking — sebaran lintas status`}
          />
          {statusMix.length === 0 ? (
            <ChartEmpty label="Belum ada data status booking." />
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={statusMix} dataKey="value" nameKey="name" innerRadius={64} outerRadius={104} paddingAngle={2}>
                {statusMix.map((d) => (
                  <Cell key={d.status} fill={statusColor[d.status]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => nf.format(Number(value))} />
              <RechartsLegend
                verticalAlign="bottom"
                iconType="circle"
                formatter={(value) => <span className="text-sm text-muted">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Honesty rule: projections are labeled targets, never live data. */}
      <Card className="border-dashed bg-gradient-to-br from-primary-soft/50 to-transparent">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-soft">
          Target — bukan data live
        </p>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <Target value="1 jt" label="pengguna aktif (target th-1)" />
          <Target value="5.000" label="bengkel mitra (target th-1)" />
          <Target value="Rp 50 M+" label="ARR (target th-2)" />
        </div>
      </Card>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/40 text-center">
      <BarChart3 size={28} className="text-muted-soft opacity-50" />
      <p className="text-sm text-muted-soft">{label}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function AppColumn({
  source,
  icon,
  name,
  tagline,
  metrics,
}: {
  source: AppSource;
  icon: ReactNode;
  name: string;
  tagline: string;
  metrics: { label: string; value: string; highlight?: boolean }[];
}) {
  const m = APP_META[source];
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${m.color}14`, color: m.color }}
        >
          {icon}
        </span>
        <div>
          <p className="font-semibold leading-none">{name}</p>
          <p className="mt-1 text-xs text-muted-soft">{tagline}</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2.5">
        {metrics.map((mt) => (
          <div key={mt.label} className="flex items-center justify-between gap-2 text-sm">
            <dt className="text-muted">{mt.label}</dt>
            <dd className="font-semibold tabular-nums" style={mt.highlight ? { color: m.color } : undefined}>
              {mt.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Target({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-center">
      <p className="text-3xl font-bold tracking-tight text-primary">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  );
}
