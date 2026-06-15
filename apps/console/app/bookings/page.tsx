"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { formatRp, type BookingRecent, type BookingStatus } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, PageHeader, Pill, SetupNotice, StatusBadge } from "@/components/ui";

const FILTERS: (BookingStatus | "all")[] = [
  "all",
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
];

export default function BookingsPage() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<BookingRecent[]>([]);
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [freshId, setFreshId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    let q = supabase.from("v_bookings_recent").select("*").limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    if (data) setRows(data as BookingRecent[]);
  }, [supabase, filter]);

  useEffect(() => {
    if (!supabase) return;
    load();
    const channel = supabase
      .channel("bookings-table")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setFreshId((payload.new as { id: string }).id);
            setTimeout(() => setFreshId(null), 3000);
          }
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<CalendarCheck size={22} />}
        title="Bookings"
        subtitle="Daftar booking terbaru — diperbarui real-time."
        action={
          <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted">
            {rows.length} booking
          </span>
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "Semua" : f.replace("_", " ")}
          </Pill>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="sticky top-0 bg-background/80 text-xs uppercase tracking-wider text-muted-soft backdrop-blur">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-semibold">Waktu</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Plat</th>
                <th className="px-5 py-3 font-semibold">Bengkel</th>
                <th className="px-5 py-3 font-semibold">Servis</th>
                <th className="px-5 py-3 text-right font-semibold">Nilai</th>
                <th className="px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className={`border-b border-border/60 transition-colors last:border-0 ${
                    b.id === freshId ? "bg-accent-soft" : "hover:bg-primary-soft/40"
                  }`}
                >
                  <td className="whitespace-nowrap px-5 py-3 text-sm text-muted">
                    {new Date(b.created_at).toLocaleString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-3 font-medium">{b.customer}</td>
                  <td className="px-5 py-3">
                    <span className="rounded-md bg-background px-2 py-0.5 font-mono text-sm text-foreground">
                      {b.plate}
                    </span>
                  </td>
                  <td className="px-5 py-3">{b.workshop}</td>
                  <td className="px-5 py-3 text-muted">{b.service}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums">
                    {b.total_amount != null ? formatRp(b.total_amount) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={b.status} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-soft">
                    Belum ada booking untuk filter ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
