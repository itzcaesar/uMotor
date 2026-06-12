"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRp, type BookingRecent, type BookingStatus } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, SetupNotice, StatusBadge } from "@/components/ui";

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
      <h1 className="text-3xl font-bold">Bookings</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              filter === f ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? "Semua" : f}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-base">
          <thead className="border-b border-gray-200 text-sm uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-5 py-3">Waktu</th>
              <th className="px-5 py-3">Customer</th>
              <th className="px-5 py-3">Plat</th>
              <th className="px-5 py-3">Bengkel</th>
              <th className="px-5 py-3">Servis</th>
              <th className="px-5 py-3 text-right">Nilai</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                className={`border-b border-gray-100 transition-colors ${
                  b.id === freshId ? "bg-amber-50" : ""
                }`}
              >
                <td className="px-5 py-3 whitespace-nowrap text-gray-500">
                  {new Date(b.created_at).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-5 py-3 font-medium">{b.customer}</td>
                <td className="px-5 py-3 font-mono text-sm">{b.plate}</td>
                <td className="px-5 py-3">{b.workshop}</td>
                <td className="px-5 py-3">{b.service}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {b.total_amount != null ? formatRp(b.total_amount) : "—"}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={b.status} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  Belum ada booking untuk filter ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
