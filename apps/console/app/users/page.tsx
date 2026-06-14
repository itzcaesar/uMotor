"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { colors, formatRp } from "@umotor/shared";
import { getSupabase } from "@/lib/supabase";
import { Card, Pill, SetupNotice } from "@/components/ui";

type UserRow = {
  id: string;
  name: string;
  astrapay_balance: number;
  created_at: string;
  motorcycles: { count: number }[];
  motoscore: { score: number } | null;
};

function scoreColor(score: number) {
  if (score < 580) return colors.danger;
  if (score < 670) return colors.warning;
  if (score < 740) return colors.primary;
  return colors.accent;
}

export default function UsersPage() {
  const supabase = getSupabase();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"score" | "bikes">("score");

  const load = useCallback(() => {
    if (!supabase) return;
    supabase
      .from("users")
      .select("id, name, astrapay_balance, created_at, motorcycles(count), motoscore(score)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setRows(data as unknown as UserRow[]);
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    load();
    // motoscore is realtime-published: a completed service ticks the score live.
    const channel = supabase
      .channel("console-users")
      .on("postgres_changes", { event: "*", schema: "public", table: "motoscore" }, () => load())
      .subscribe();
    const poll = setInterval(load, 12000); // fallback for balances / new users
    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [supabase, load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = rows.filter((u) => u.name.toLowerCase().includes(q));
    return list.sort((a, b) =>
      sortBy === "score"
        ? (b.motoscore?.score ?? 0) - (a.motoscore?.score ?? 0)
        : (b.motorcycles[0]?.count ?? 0) - (a.motorcycles[0]?.count ?? 0),
    );
  }, [rows, search, sortBy]);

  if (!supabase) return <SetupNotice />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="mt-1 text-muted">Pengguna aktif uMotor, jumlah motor, dan MotoScore.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari pengguna…"
          className="w-72 rounded-xl border border-border bg-card px-4 py-2 text-base outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex gap-2">
          {(["score", "bikes"] as const).map((s) => (
            <Pill key={s} active={sortBy === s} onClick={() => setSortBy(s)}>
              Urut: {s === "score" ? "MotoScore" : "Jumlah motor"}
            </Pill>
          ))}
        </div>
        <span className="ml-auto rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted">
          {filtered.length} pengguna
        </span>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead className="bg-background/80 text-xs uppercase tracking-wider text-muted-soft">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-semibold">Nama</th>
                <th className="px-5 py-3 font-semibold">Motor</th>
                <th className="px-5 py-3 font-semibold">MotoScore</th>
                <th className="px-5 py-3 text-right font-semibold">Saldo AstraPay</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const score = u.motoscore?.score ?? null;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-primary-soft/40"
                  >
                    <td className="px-5 py-3 font-medium">{u.name}</td>
                    <td className="px-5 py-3 text-muted">{u.motorcycles[0]?.count ?? 0}</td>
                    <td className="px-5 py-3">
                      {score != null ? (
                        <span
                          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-semibold"
                          style={{ color: scoreColor(score), backgroundColor: `${scoreColor(score)}1a` }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: scoreColor(score) }}
                          />
                          {score}
                        </span>
                      ) : (
                        <span className="text-muted-soft">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {formatRp(u.astrapay_balance)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-muted-soft">
                    Tidak ada pengguna cocok.
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
