"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import type { Workshop } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, Pill, SetupNotice } from "@/components/ui";

type WorkshopRow = Workshop & { bookings: { count: number }[] };

export default function WorkshopsPage() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<WorkshopRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "bookings">("rating");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("workshops")
      .select("*, bookings(count)")
      .then(({ data }) => {
        if (data) setRows(data as WorkshopRow[]);
      });
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = rows.filter((w) => w.name.toLowerCase().includes(q));
    return list.sort((a, b) =>
      sortBy === "rating"
        ? b.rating - a.rating
        : (b.bookings[0]?.count ?? 0) - (a.bookings[0]?.count ?? 0),
    );
  }, [rows, search, sortBy]);

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Workshops</h1>
        <p className="mt-1 text-muted">Bengkel mitra AHASS &amp; independen di jaringan uMotor.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-soft" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari bengkel…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-base outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          {(["rating", "bookings"] as const).map((s) => (
            <Pill key={s} active={sortBy === s} onClick={() => setSortBy(s)}>
              Urut: {s === "rating" ? "Rating" : "Bookings"}
            </Pill>
          ))}
        </div>
        <span className="ml-auto rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted">
          {filtered.length} bengkel
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="bg-background/80 text-xs uppercase tracking-wider text-muted-soft">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-semibold">Nama</th>
                <th className="px-5 py-3 font-semibold">Tipe</th>
                <th className="px-5 py-3 font-semibold">Tier</th>
                <th className="px-5 py-3 font-semibold">Rating</th>
                <th className="px-5 py-3 font-semibold">Jarak</th>
                <th className="px-5 py-3 font-semibold">Home Service</th>
                <th className="px-5 py-3 text-right font-semibold">Bookings</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-primary-soft/40"
                >
                  <td className="px-5 py-3 font-medium">{w.name}</td>
                  <td className="px-5 py-3">
                    {w.type === "ahass" ? (
                      <span className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                        AHASS
                      </span>
                    ) : (
                      <span className="text-muted">Independen</span>
                    )}
                  </td>
                  <td className="px-5 py-3 capitalize">
                    <span className="rounded-md bg-primary-soft px-2 py-0.5 text-sm font-medium text-primary">
                      {w.tier}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Star size={14} className="fill-warning text-warning" />
                      {Number(w.rating).toFixed(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">
                    {w.distance_km != null ? `${w.distance_km} km` : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {w.home_service ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-sm font-medium text-accent">
                        Ya
                      </span>
                    ) : (
                      <span className="text-muted-soft">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">
                    {w.bookings[0]?.count ?? 0}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-soft">
                    Tidak ada bengkel cocok.
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
