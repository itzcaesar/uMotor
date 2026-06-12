"use client";

import { useEffect, useMemo, useState } from "react";
import type { Workshop } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, SetupNotice } from "@/components/ui";

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
      <h1 className="text-3xl font-bold">Workshops</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari bengkel…"
          className="w-72 rounded-lg border border-gray-200 bg-white px-4 py-2 outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          {(["rating", "bookings"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                sortBy === s ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              Urut: {s === "rating" ? "Rating" : "Bookings"}
            </button>
          ))}
        </div>
        <p className="ml-auto text-sm text-gray-400">{filtered.length} bengkel</p>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-base">
          <thead className="border-b border-gray-200 text-sm uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-5 py-3">Nama</th>
              <th className="px-5 py-3">Tipe</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3">Rating</th>
              <th className="px-5 py-3">Jarak</th>
              <th className="px-5 py-3">Home Service</th>
              <th className="px-5 py-3 text-right">Bookings</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr key={w.id} className="border-b border-gray-100">
                <td className="px-5 py-3 font-medium">{w.name}</td>
                <td className="px-5 py-3">
                  {w.type === "ahass" ? (
                    <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                      AHASS
                    </span>
                  ) : (
                    <span className="text-gray-500">Independen</span>
                  )}
                </td>
                <td className="px-5 py-3 capitalize">{w.tier}</td>
                <td className="px-5 py-3">★ {Number(w.rating).toFixed(1)}</td>
                <td className="px-5 py-3 text-gray-500">
                  {w.distance_km != null ? `${w.distance_km} km` : "—"}
                </td>
                <td className="px-5 py-3">{w.home_service ? "Ya" : "—"}</td>
                <td className="px-5 py-3 text-right">{w.bookings[0]?.count ?? 0}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  Tidak ada bengkel cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
