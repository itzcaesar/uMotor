import { STATUS_LABELS, statusColor, type BookingStatus } from "@umotor/shared";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  caption,
  highlight = false,
}: {
  label: string;
  value: string;
  caption?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "ring-2 ring-primary transition-shadow" : ""}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-5xl font-bold tracking-tight">{value}</p>
      {caption && <p className="mt-1 text-sm text-gray-400">{caption}</p>}
    </Card>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-sm font-semibold text-white"
      style={{ backgroundColor: statusColor[status] }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function SetupNotice() {
  return (
    <Card className="max-w-xl">
      <h2 className="text-lg font-semibold">Supabase belum dikonfigurasi</h2>
      <p className="mt-2 text-gray-600">
        Salin <code className="rounded bg-gray-100 px-1">.env.example</code> ke{" "}
        <code className="rounded bg-gray-100 px-1">.env.local</code> lalu isi URL dan anon key dari
        project Supabase (Settings → API). Jalankan migration + seed dulu:{" "}
        <code className="rounded bg-gray-100 px-1">supabase db reset --linked</code>.
      </p>
    </Card>
  );
}
