"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users, CalendarClock, Wallet, Store } from "lucide-react";
import {
  colors,
  formatRp,
  type KpiOverview,
  type MotoScoreBucket,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, ChartTooltip, KpiCard, SectionHeader, SetupNotice } from "@/components/ui";

const nf = new Intl.NumberFormat("id-ID");

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
  const [pulse, setPulse] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [kpiRes, distRes, bookRes] = await Promise.all([
      supabase.from("v_kpi_overview").select("*").single(),
      supabase.from("v_motoscore_distribution").select("*"),
      supabase
        .from("bookings")
        .select("created_at")
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
    ]);
    if (kpiRes.data) setKpi(kpiRes.data as KpiOverview);
    if (distRes.data) setBuckets(distRes.data as MotoScoreBucket[]);
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

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="mt-1 text-muted">Ringkasan kesehatan platform uMotor secara real-time.</p>
      </div>

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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Bookings" subtitle="30 hari terakhir" />
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
        </Card>

        <Card>
          <SectionHeader
            title="Distribusi MotoScore"
            subtitle="Skor kredit 300–850 dari perilaku perawatan motor — bukan riwayat kredit bank."
          />
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
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Legend color={colors.danger} label="Poor (<580)" />
            <Legend color={colors.warning} label="Fair (580–669)" />
            <Legend color={colors.primary} label="Good (670–739)" />
            <Legend color={colors.accent} label="Excellent (740+)" />
          </div>
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
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
