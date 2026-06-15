"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  Wrench,
  Users,
  Radio,
  BarChart3,
  Bike,
  Sparkles,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/live", label: "Live Ops", icon: Radio },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/workshops", label: "Workshops", icon: Wrench },
  { href: "/users", label: "Users", icon: Users },
  { href: "/rides", label: "Ride Intel", icon: Bike },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card/80 backdrop-blur">
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#1769d6] text-lg font-black text-white shadow-md">
          u
        </div>
        <div>
          <p className="text-xl font-extrabold leading-none tracking-tight text-foreground">
            uMotor
          </p>
          <p className="mt-1 text-xs font-medium text-muted-soft">Ops Console</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-soft">
          Menu
        </p>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors ${
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-primary-soft/60 hover:text-primary"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 -translate-y-1/2 rounded-r-full border-l-[3px] border-primary" />
              )}
              <Icon size={19} className={active ? "text-primary" : "text-muted-soft group-hover:text-primary"} />
              {label}
            </Link>
          );
        })}

        <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-soft">
          AI
        </p>
        <Link
          href="/copilot"
          className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors ${
            pathname === "/copilot"
              ? "bg-gradient-to-r from-primary to-[#1769d6] text-white shadow-sm"
              : "border border-primary/20 bg-primary-soft/40 text-primary hover:bg-primary-soft"
          }`}
        >
          <Sparkles size={19} className={pathname === "/copilot" ? "text-white" : "text-primary"} />
          uMotor AI
          <span
            className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
              pathname === "/copilot" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
            }`}
          >
            Copilot
          </span>
        </Link>
      </nav>

      <div className="mt-auto px-4 py-4">
        <div className="rounded-xl border border-border bg-background/60 px-3 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-accent">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-accent" />
            Realtime aktif
          </p>
          <p className="mt-1 text-xs text-muted-soft">Prototype — seeded sample data</p>
        </div>
      </div>
    </aside>
  );
}
