"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarCheck, Wrench } from "lucide-react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/bookings", label: "Bookings", icon: CalendarCheck },
  { href: "/workshops", label: "Workshops", icon: Wrench },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="px-6 py-5">
        <p className="text-2xl font-extrabold text-primary">uMotor</p>
        <p className="text-xs text-gray-400">Console — Ops Dashboard</p>
      </div>
      <nav className="flex flex-col gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium ${
                active ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-6 py-4 text-xs text-gray-400">
        Prototype — seeded sample data
      </div>
    </aside>
  );
}
