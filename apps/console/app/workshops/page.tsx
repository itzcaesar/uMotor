"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { colors, type Workshop } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, Pill, SectionHeader, SetupNotice } from "@/components/ui";

type WorkshopRow = Workshop & { bookings: { count: number }[] };

/**
 * Geographic spread of partner workshops (PRD 03). Dependency-free SVG scatter
 * over the Bandung bounding box — no map-tile lib, so it works offline on
 * demo day. Dot size scales with booking volume; AHASS red, independent blue.
 */
function WorkshopMap({ rows }: { rows: WorkshopRow[] }) {
  const points = rows.filter((w) => w.lat != null && w.lng != null);
  if (points.length === 0) return null;

  const lats = points.map((w) => Number(w.lat));
  const lngs = points.map((w) => Number(w.lng));
  const pad = 0.01;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const W = 920;
  const H = 360;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * W;
  const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
  const maxBookings = Math.max(1, ...points.map((w) => w.bookings[0]?.count ?? 0));

  return (
    <Card>
      <SectionHeader
        title="Peta sebaran bengkel"
        subtitle="Bandung Raya — ukuran titik mengikuti volume booking. Arahkan kursor untuk nama bengkel."
      />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-xl border border-border bg-[#f4f7fb]"
        role="img"
        aria-label="Peta sebaran bengkel mitra di Bandung"
      >
        {/* subtle grid so the scatter reads as a map, not a chart */}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={(W / 7) * (i + 0.5)}
            y1={0}
            x2={(W / 7) * (i + 0.5)}
            y2={H}
            stroke="#e5ecf5"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={(H / 4) * (i + 0.5)}
            x2={W}
            y2={(H / 4) * (i + 0.5)}
            stroke="#e5ecf5"
            strokeWidth={1}
          />
        ))}
        {points.map((w) => {
          const n = w.bookings[0]?.count ?? 0;
          const r = 4 + (n / maxBookings) * 8;
          const fill = w.type === "ahass" ? "#dc2626" : colors.primary;
          return (
            <circle
              key={w.id}
              cx={x(Number(w.lng))}
              cy={y(Number(w.lat))}
              r={r}
              fill={fill}
              fillOpacity={0.55}
              stroke={fill}
              strokeWidth={1.5}
            >
              <title>{`${w.name} — ★ ${Number(w.rating).toFixed(1)} · ${n} booking`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600/70" /> AHASS
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: `${colors.primary}b3` }} />{" "}
          Independen
        </span>
        <span className="text-muted-soft">{points.length} bengkel dengan koordinat</span>
      </div>
    </Card>
  );
}

export default function WorkshopsPage() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<WorkshopRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"rating" | "bookings">("rating");

  const load = useCallback(() => {
    if (!supabase) return;
    supabase
      .from("workshops")
      .select("*, bookings(count)")
      .then(({ data }) => {
        if (data) setRows(data as WorkshopRow[]);
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    load();
    // bookings is realtime-published → counts bump live. The 12s poll also
    // surfaces a workshop just signed up in the partner app (workshops table
    // itself isn't in the realtime publication).
    const channel = supabase
      .channel("console-workshops")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    const poll = setInterval(load, 12000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, load]);

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

      <WorkshopMap rows={rows} />

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
