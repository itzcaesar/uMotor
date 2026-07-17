import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { STATUS_LABELS, statusColor, type BookingStatus } from "@umotor/shared";

export function Card({
  children,
  className = "",
  hover = false,
  enter = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  enter?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)] ${
        enter ? "animate-rise " : ""
      }${
        hover ? "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(16,24,40,0.05),0_16px_32px_-12px_rgba(16,24,40,0.18)] " : ""
      }${className}`}
    >
      {children}
    </div>
  );
}

/** Consistent page hero: gradient icon chip + title + subtitle + optional action. */
export function PageHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#1769d6] text-white shadow-lg shadow-primary/25">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export type AppSource = "consumer" | "partner" | "system";
export const APP_META: Record<AppSource, { label: string; color: string; cls: string }> = {
  consumer: { label: "Konsumen", color: "#0E4DA4", cls: "bg-primary-soft text-primary" },
  partner: { label: "Mitra", color: "#00A86B", cls: "bg-accent-soft text-accent" },
  system: { label: "Sistem", color: "#7048e8", cls: "bg-[#efeaff] text-[#7048e8]" },
};

/** Small chip marking which connected app an event/metric originates from. */
export function AppBadge({ app }: { app: AppSource }) {
  const m = APP_META[app];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
      {m.label}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  caption,
  icon,
  accent = "primary",
  trend,
  highlight = false,
  live = false,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: ReactNode;
  accent?: "primary" | "accent" | "warning";
  trend?: { dir: "up" | "down"; text: string };
  highlight?: boolean;
  live?: boolean;
}) {
  const accentMap = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    warning: "bg-[#fdf3e3] text-warning",
  } as const;

  return (
    <Card
      hover
      enter
      className={`relative overflow-hidden ${highlight ? "ring-2 ring-accent" : ""}`}
    >
      {/* accent corner glow */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 blur-2xl ${
          accent === "accent" ? "bg-accent-soft" : accent === "warning" ? "bg-[#fdf3e3]" : "bg-primary-soft"
        }`}
      />
      <div className="relative flex items-start justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accentMap[accent]}`}>
            {icon}
          </span>
        )}
      </div>
      <p className="relative mt-3 text-4xl font-bold tracking-tight tabular-nums">{value}</p>
      <div className="relative mt-2 flex items-center gap-2">
        {live && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent" />
            LIVE
          </span>
        )}
        {trend && (
          <span
            className={`text-xs font-semibold ${trend.dir === "up" ? "text-accent" : "text-danger"}`}
          >
            {trend.dir === "up" ? "▲" : "▼"} {trend.text}
          </span>
        )}
        {caption && !live && <span className="text-sm text-muted-soft">{caption}</span>}
      </div>
    </Card>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const color = statusColor[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color, backgroundColor: `${color}1a` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
        active
          ? "bg-primary text-white shadow-sm"
          : "border border-border bg-card text-muted hover:bg-primary-soft hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

/** Shared Recharts tooltip so both charts match the dashboard style. */
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-semibold text-foreground">{p.value.toLocaleString("id-ID")}</span>
        </p>
      ))}
    </div>
  );
}

/** First-load spinner card — keeps the page from looking empty while data fetches. */
export function Loading({ label = "Memuat data…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-3 py-16 text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden />
      <span className="text-sm">{label}</span>
    </Card>
  );
}

/** Error card with retry — console's equivalent of the mobile ErrorState. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 border-danger/30 bg-danger/5 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertTriangle size={22} />
      </span>
      <div>
        <p className="font-semibold text-foreground">Gagal memuat data</p>
        <p className="mt-1 text-sm text-muted">{message ?? "Periksa koneksi lalu coba lagi."}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
          Muat ulang
        </button>
      )}
    </Card>
  );
}

export function SetupNotice() {
  return (
    <Card className="max-w-xl">
      <h2 className="text-lg font-semibold">Supabase belum dikonfigurasi</h2>
      <p className="mt-2 text-muted">
        Isi URL dan anon key Supabase di <code className="rounded bg-primary-soft px-1 text-primary">.env.local</code>{" "}
        memakai <code className="rounded bg-primary-soft px-1 text-primary">NEXT_PUBLIC_SUPABASE_*</code>, atau gunakan
        konfigurasi <code className="rounded bg-primary-soft px-1 text-primary">EXPO_PUBLIC_SUPABASE_*</code> yang sama
        dengan aplikasi mobile. Jalankan migration + seed dulu:{" "}
        <code className="rounded bg-primary-soft px-1 text-primary">supabase db reset --linked</code>.
      </p>
    </Card>
  );
}
