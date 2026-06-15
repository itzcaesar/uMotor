import { createSupabase, formatRp, type KpiOverview, type RevenueBreakdown } from "@umotor/shared";

/**
 * Live platform snapshot for the uMotor AI Copilot. Gathered server-side from
 * the same hosted Supabase the dashboards read (anon key, permissive RLS). Both
 * the model path (as grounding context) and the keyless fallback analyst read
 * this — so the copilot always answers with real numbers, never hallucinated.
 */

const REVENUE_LABELS: Record<string, string> = {
  deposit: "Deposit booking",
  final: "Pelunasan servis",
  sparepart: "Sparepart",
  bill: "Tagihan (STNK/BBM)",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  confirmed: "Dikonfirmasi",
  checked_in: "Check-in",
  in_progress: "Dikerjakan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export interface PlatformSnapshot {
  kpi: KpiOverview | null;
  revenue: { type: string; label: string; total: number }[];
  revenueTotal: number;
  statusCounts: Record<string, number>;
  bookingsTotal: number;
  scoreBands: { poor: number; fair: number; good: number; excellent: number; avg: number; total: number };
  topWorkshops: { name: string; type: string; rating: number; bookings: number }[];
  rides: { count: number; totalKm: number; avgEco: number; flagged: number; co2SavedKg: number };
  recent: { customer: string; workshop: string; service: string; status: string; amount: number | null; at: string }[];
  // Footprint of each connected app — all three write to the one backend.
  crossApp: {
    consumer: { activeUsers: number; rideKm: number; billsUnpaid: number; billsUnpaidAmount: number; avgScore: number };
    partner: {
      workshops: number;
      ahass: number;
      slotsTotal: number;
      slotsBooked: number;
      utilizationPct: number;
      sparepartListings: number;
      partnerNet: number;
    };
  };
  gatheredAt: string;
}

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabase(url, key);
}

export async function gatherSnapshot(): Promise<PlatformSnapshot | null> {
  const supabase = serverSupabase();
  if (!supabase) return null;

  const [kpiRes, revRes, distRes, wsRes, rideRes, statusRes, recentRes, billRes, slotRes, partRes] =
    await Promise.all([
      supabase.from("v_kpi_overview").select("*").single(),
      supabase.from("v_revenue_breakdown").select("*"),
      supabase.from("v_motoscore_distribution").select("*"),
      supabase.from("workshops").select("name, type, rating, bookings(count)"),
      supabase.from("rides").select("eco_score, distance_m, flagged, status"),
      supabase.from("bookings").select("status"),
      supabase.from("v_bookings_recent").select("*").limit(8),
      supabase.from("bills").select("paid, amount"), // consumer Finance Hub
      supabase.from("slots").select("capacity, booked_count"), // partner Jadwal
      supabase.from("spareparts").select("*", { count: "exact", head: true }), // partner marketplace
    ]);

  const kpi = (kpiRes.data as KpiOverview) ?? null;

  const revenue = ((revRes.data as RevenueBreakdown[]) ?? []).map((r) => ({
    type: r.type,
    label: REVENUE_LABELS[r.type] ?? r.type,
    total: r.total,
  }));
  const revenueTotal = revenue.reduce((s, r) => s + r.total, 0);

  // MotoScore credit bands from the distribution view (bucket_min / n).
  const dist = (distRes.data as { bucket_min: number; n: number }[]) ?? [];
  const bands = { poor: 0, fair: 0, good: 0, excellent: 0, total: 0, weighted: 0 };
  for (const b of dist) {
    bands.total += b.n;
    bands.weighted += (b.bucket_min + 25) * b.n; // bucket midpoint ≈ min + half bucket width (~50)
    if (b.bucket_min < 580) bands.poor += b.n;
    else if (b.bucket_min < 670) bands.fair += b.n;
    else if (b.bucket_min < 740) bands.good += b.n;
    else bands.excellent += b.n;
  }
  const scoreBands = {
    poor: bands.poor,
    fair: bands.fair,
    good: bands.good,
    excellent: bands.excellent,
    total: bands.total,
    avg: bands.total ? Math.round(bands.weighted / bands.total) : 0,
  };

  type WsRow = { name: string; type: string; rating: number; bookings: { count: number }[] };
  const topWorkshops = ((wsRes.data as WsRow[]) ?? [])
    .map((w) => ({ name: w.name, type: w.type, rating: Number(w.rating), bookings: w.bookings[0]?.count ?? 0 }))
    .sort((a, b) => b.bookings - a.bookings)
    .slice(0, 5);

  type RideRow = { eco_score: number | null; distance_m: number; flagged: boolean; status: string };
  const rideRows = ((rideRes.data as RideRow[]) ?? []).filter((r) => r.status === "completed");
  const totalM = rideRows.reduce((s, r) => s + (r.distance_m ?? 0), 0);
  const ecoVals = rideRows.map((r) => r.eco_score ?? 0).filter((v) => v > 0);
  const rides = {
    count: rideRows.length,
    totalKm: Math.round(totalM / 1000),
    avgEco: ecoVals.length ? Math.round(ecoVals.reduce((s, v) => s + v, 0) / ecoVals.length) : 0,
    flagged: rideRows.filter((r) => r.flagged).length,
    co2SavedKg: Math.round((totalM / 1000) * 0.08), // ~80 g CO2/km vs car baseline (demo figure)
  };

  const statusCounts: Record<string, number> = {};
  let bookingsTotal = 0;
  for (const row of (statusRes.data as { status: string }[]) ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    bookingsTotal += 1;
  }

  type RecentRow = {
    customer: string; workshop: string; service: string; status: string;
    total_amount: number | null; created_at: string;
  };
  const recent = ((recentRes.data as RecentRow[]) ?? []).map((r) => ({
    customer: r.customer,
    workshop: r.workshop,
    service: r.service,
    status: r.status,
    amount: r.total_amount,
    at: r.created_at,
  }));

  // ── Cross-app footprint ────────────────────────────────────────────
  const ahass = ((wsRes.data as WsRow[]) ?? []).filter((w) => w.type === "ahass").length;
  const billRows = (billRes.data as { paid: boolean; amount: number }[]) ?? [];
  const unpaid = billRows.filter((b) => !b.paid);
  const slotRows = (slotRes.data as { capacity: number; booked_count: number }[]) ?? [];
  const slotsTotal = slotRows.reduce((s, r) => s + r.capacity, 0);
  const slotsBooked = slotRows.reduce((s, r) => s + r.booked_count, 0);
  const finalTotal = revenue.find((r) => r.type === "final")?.total ?? 0;

  const crossApp = {
    consumer: {
      activeUsers: kpi?.active_users ?? scoreBands.total,
      rideKm: rides.totalKm,
      billsUnpaid: unpaid.length,
      billsUnpaidAmount: unpaid.reduce((s, b) => s + b.amount, 0),
      avgScore: scoreBands.avg,
    },
    partner: {
      workshops: kpi?.partner_workshops ?? 0,
      ahass,
      slotsTotal,
      slotsBooked,
      utilizationPct: slotsTotal ? Math.round((slotsBooked / slotsTotal) * 100) : 0,
      sparepartListings: partRes.count ?? 0,
      partnerNet: Math.round(finalTotal * 0.95), // net of 5% simulated platform fee
    },
  };

  return {
    kpi,
    revenue,
    revenueTotal,
    statusCounts,
    bookingsTotal,
    scoreBands,
    topWorkshops,
    rides,
    recent,
    crossApp,
    gatheredAt: new Date().toISOString(),
  };
}

/** Compact, model-readable rendering of the snapshot for the uMotor AI system prompt. */
export function snapshotToText(s: PlatformSnapshot): string {
  const lines: string[] = [];
  if (s.kpi) {
    lines.push(
      `KPI: pengguna aktif ${s.kpi.active_users}, booking hari ini ${s.kpi.bookings_today}, ` +
        `GMV total ${formatRp(s.kpi.gmv)}, bengkel mitra ${s.kpi.partner_workshops}.`,
    );
  }
  lines.push(
    `Pendapatan per sumber (total ${formatRp(s.revenueTotal)}): ` +
      s.revenue.map((r) => `${r.label} ${formatRp(r.total)}`).join("; ") + ".",
  );
  lines.push(
    `Booking per status (total ${s.bookingsTotal}): ` +
      Object.entries(s.statusCounts)
        .map(([k, v]) => `${STATUS_LABELS[k] ?? k} ${v}`)
        .join("; ") + ".",
  );
  lines.push(
    `MotoScore ${s.scoreBands.total} pengguna, rata-rata ~${s.scoreBands.avg}. ` +
      `Poor(<580) ${s.scoreBands.poor}, Fair(580-669) ${s.scoreBands.fair}, ` +
      `Good(670-739) ${s.scoreBands.good}, Excellent(740+) ${s.scoreBands.excellent}.`,
  );
  lines.push(
    "Bengkel teratas (volume booking): " +
      s.topWorkshops.map((w) => `${w.name} [${w.type}, ★${w.rating.toFixed(1)}, ${w.bookings} booking]`).join("; ") + ".",
  );
  lines.push(
    `Ride tracking: ${s.rides.count} ride selesai, ${s.rides.totalKm} km, eco rata-rata ${s.rides.avgEco}/100, ` +
      `${s.rides.flagged} ride ditandai (anti-cheat), ~${s.rides.co2SavedKg} kg CO2 dihemat.`,
  );
  const c = s.crossApp;
  lines.push(
    `Aplikasi KONSUMEN: ${c.consumer.activeUsers} rider, ${c.consumer.rideKm} km ride, ` +
      `${c.consumer.billsUnpaid} tagihan belum dibayar (${formatRp(c.consumer.billsUnpaidAmount)}), MotoScore rata-rata ~${c.consumer.avgScore}.`,
  );
  lines.push(
    `Aplikasi MITRA: ${c.partner.workshops} bengkel (${c.partner.ahass} AHASS), ` +
      `${c.partner.sparepartListings} listing sparepart, utilisasi slot ${c.partner.utilizationPct}% (${c.partner.slotsBooked}/${c.partner.slotsTotal}), ` +
      `estimasi pendapatan mitra ${formatRp(c.partner.partnerNet)} (net 95%).`,
  );
  if (s.recent.length) {
    lines.push(
      "Booking terbaru: " +
        s.recent
          .slice(0, 6)
          .map((r) => `${r.customer} @ ${r.workshop} (${r.service}, ${STATUS_LABELS[r.status] ?? r.status})`)
          .join("; ") + ".",
    );
  }
  return lines.join("\n");
}

/**
 * Keyless fallback analyst — pattern-matches the question against the live
 * snapshot so the copilot still gives a real, data-grounded answer when no
 * ANTHROPIC_API_KEY is set (or the API call fails on stage).
 */
export function localAnswer(question: string, s: PlatformSnapshot): string {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("pendapatan", "revenue", "gmv", "omzet", "uang", "duit", "income")) {
    const top = [...s.revenue].sort((a, b) => b.total - a.total)[0];
    return (
      `GMV total platform **${formatRp(s.kpi?.gmv ?? s.revenueTotal)}**. Rincian per sumber:\n` +
      s.revenue.map((r) => `• ${r.label}: ${formatRp(r.total)}`).join("\n") +
      (top ? `\n\nKontributor terbesar: **${top.label}** (${formatRp(top.total)}).` : "")
    );
  }
  if (has("aplikasi", "apps", "tiga", "3 app", "cross", "ekosistem", "konsumen", "terhubung")) {
    const c = s.crossApp;
    return (
      `**Tiga aplikasi, satu backend:**\n\n` +
      `**Konsumen** — ${c.consumer.activeUsers} rider, ${c.consumer.rideKm} km ride, ` +
      `${c.consumer.billsUnpaid} tagihan belum bayar, MotoScore rata-rata ~${c.consumer.avgScore}.\n` +
      `**Mitra** — ${c.partner.workshops} bengkel (${c.partner.ahass} AHASS), utilisasi slot ${c.partner.utilizationPct}%, ` +
      `${c.partner.sparepartListings} sparepart, est. pendapatan ${formatRp(c.partner.partnerNet)}.\n` +
      `**Console** — ${s.bookingsTotal} booking, GMV ${formatRp(s.kpi?.gmv ?? s.revenueTotal)}.`
    );
  }
  if (has("tagihan", "bill", "stnk", "cicilan", "finance", "keuangan")) {
    const c = s.crossApp.consumer;
    return (
      `Finance Hub (app konsumen): **${c.billsUnpaid}** tagihan belum dibayar senilai **${formatRp(c.billsUnpaidAmount)}**.\n` +
      `Pembayaran via AstraPay sudah masuk GMV total ${formatRp(s.kpi?.gmv ?? s.revenueTotal)}.`
    );
  }
  if (has("slot", "jadwal", "utilisasi", "kapasitas")) {
    const p = s.crossApp.partner;
    return (
      `Jadwal & kapasitas (app mitra): utilisasi slot **${p.utilizationPct}%** — ${p.slotsBooked} dari ${p.slotsTotal} slot terisi ` +
      `di ${p.workshops} bengkel. ${p.sparepartListings} listing sparepart aktif di marketplace.`
    );
  }
  if (has("bengkel", "workshop", "mitra", "partner")) {
    return (
      `Ada **${s.kpi?.partner_workshops ?? "—"}** bengkel mitra. Teratas berdasarkan volume booking:\n` +
      s.topWorkshops
        .map((w, i) => `${i + 1}. ${w.name} — ${w.bookings} booking, ★${w.rating.toFixed(1)} (${w.type})`)
        .join("\n")
    );
  }
  if (has("skor", "motoscore", "kredit", "credit", "score")) {
    return (
      `MotoScore ${s.scoreBands.total} pengguna, rata-rata **~${s.scoreBands.avg}**.\n` +
      `• Excellent (740+): ${s.scoreBands.excellent}\n• Good (670–739): ${s.scoreBands.good}\n` +
      `• Fair (580–669): ${s.scoreBands.fair}\n• Poor (<580): ${s.scoreBands.poor}\n\n` +
      `MotoScore dihitung dari perilaku perawatan motor — bukan riwayat kredit bank — dan jadi dasar penawaran pinjaman/asuransi.`
    );
  }
  if (has("ride", "perjalanan", "fraud", "cheat", "curang", "odometer", "eco", "co2")) {
    return (
      `Ride tracking: **${s.rides.count}** ride selesai, total **${s.rides.totalKm} km**, ` +
      `eco rata-rata **${s.rides.avgEco}/100**, **${s.rides.flagged}** ride ditandai anti-cheat, ` +
      `~${s.rides.co2SavedKg} kg CO₂ dihemat.\n\n` +
      `Jarak dihitung ulang di server (haversine) dari titik GPS — track mock-location/teleport ditolak sebelum reward & odometer diberikan.`
    );
  }
  if (has("booking", "pesanan", "servis", "antrian", "funnel", "order")) {
    const lines = Object.entries(s.statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `• ${STATUS_LABELS[k] ?? k}: ${v}`);
    return (
      `Total **${s.bookingsTotal}** booking. Booking hari ini: **${s.kpi?.bookings_today ?? "—"}**.\n` +
      lines.join("\n")
    );
  }
  if (has("user", "pengguna", "pelanggan", "customer", "rider")) {
    return (
      `**${s.kpi?.active_users ?? "—"}** pengguna aktif. ` +
      `MotoScore rata-rata ~${s.scoreBands.avg}; ${s.scoreBands.excellent + s.scoreBands.good} di antaranya layak kredit (Good+).`
    );
  }

  // Default: platform health summary.
  return (
    `Ringkasan platform uMotor:\n` +
    (s.kpi
      ? `• Pengguna aktif: ${s.kpi.active_users}\n• Booking hari ini: ${s.kpi.bookings_today}\n` +
        `• GMV: ${formatRp(s.kpi.gmv)}\n• Bengkel mitra: ${s.kpi.partner_workshops}\n`
      : "") +
    `• Total booking: ${s.bookingsTotal}\n• Ride selesai: ${s.rides.count} (${s.rides.totalKm} km)\n\n` +
    `Tanya soal pendapatan, bengkel, MotoScore, booking, ride, atau pengguna untuk detail.`
  );
}
