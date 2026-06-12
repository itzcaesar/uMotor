"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  colors,
  formatRp,
  type KpiOverview,
  type MotoScoreBucket,
} from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, KpiCard, SetupNotice } from "@/components/ui";

const nf = new Intl.NumberFormat("id-ID");

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
    () => buckets.map((b) => ({ label: String(b.bucket_min), n: b.n })),
    [buckets],
  );

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Overview</h1>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard label="Active Users" value={kpi ? nf.format(kpi.active_users) : "—"} />
        <KpiCard
          label="Bookings Today"
          value={kpi ? nf.format(kpi.bookings_today) : "—"}
          caption="live"
          highlight={pulse}
        />
        <KpiCard label="GMV" value={kpi ? formatRp(kpi.gmv) : "—"} />
        <KpiCard label="Partner Workshops" value={kpi ? nf.format(kpi.partner_workshops) : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Bookings — 30 hari terakhir</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="n" name="Bookings" fill={colors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Distribusi MotoScore</h2>
          <p className="mb-4 text-sm text-gray-500">
            Skor kredit 300–850 dari perilaku perawatan motor — bukan riwayat kredit bank.
          </p>
          <ResponsiveContainer width="100%" height={232}>
            <BarChart data={histogram}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="n" name="Pengguna" fill={colors.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Honesty rule: projections are labeled targets, never live data. */}
      <Card className="border-dashed">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Target — bukan data live
        </p>
        <div className="mt-2 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold text-primary">1 jt</p>
            <p className="text-sm text-gray-500">pengguna aktif (target th-1)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">5.000</p>
            <p className="text-sm text-gray-500">bengkel mitra (target th-1)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-primary">Rp 50 M+</p>
            <p className="text-sm text-gray-500">ARR (target th-2)</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
