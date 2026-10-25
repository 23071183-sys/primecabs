import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardCheck,
  History,
  IdCard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  ReceiptIndianRupee,
  Settings,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { api } from "@/lib/api";
import { roleLabel, useAuth } from "@/lib/auth";
import { initials } from "@/lib/format";
import type { Overview, Permission } from "@/lib/types";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
  badge?: (o: Overview) => number;
}

const NAV: { heading?: string; items: NavItem[] }[] = [
  { items: [{ to: "/", label: "Overview", icon: <LayoutDashboard className="size-4" /> }] },
  {
    heading: "Operations",
    items: [
      { to: "/drivers", label: "Drivers", icon: <IdCard className="size-4" />, permission: "drivers.read", badge: (o) => o.driversPending },
      { to: "/rides", label: "Ride approvals", icon: <ClipboardCheck className="size-4" />, permission: "rides.read", badge: (o) => o.ridesPending },
      { to: "/bookings", label: "Bookings", icon: <Ticket className="size-4" />, permission: "bookings.read" },
      { to: "/money", label: "Payments and refunds", icon: <ReceiptIndianRupee className="size-4" />, permission: "payments.read", badge: (o) => o.refundsFailed },
    ],
  },
  {
    heading: "Setup",
    items: [
      { to: "/places", label: "Cities and routes", icon: <MapPin className="size-4" />, permission: "config.read" },
      { to: "/settings", label: "Settings", icon: <Settings className="size-4" />, permission: "config.read" },
      { to: "/staff", label: "Admin users", icon: <Users className="size-4" />, permission: "admins.manage" },
      { to: "/audit", label: "Audit log", icon: <History className="size-4" />, permission: "audit.read" },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { admin, can, signOut } = useAuth();
  const overview = useQuery({ queryKey: ["overview"], queryFn: () => api<Overview>("/admin/overview"), refetchInterval: 60_000 });

  return (
    <div className="flex h-full flex-col bg-navy-700 text-white">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <div className="flex size-8 items-center justify-center rounded-lg bg-white/10">
          <Building2 className="size-4 text-teal-400" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">PrimeCabs</div>
          <div className="text-[11px] text-white/60">Admin portal</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Main">
        {NAV.map((group, gi) => {
          const items = group.items.filter((i) => !i.permission || can(i.permission));
          if (!items.length) return null;
          return (
            <div key={gi}>
              {group.heading && <div className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wider text-white/45">{group.heading}</div>}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const count = overview.data && item.badge ? item.badge(overview.data) : 0;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === "/"}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          `flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors ${
                            isActive ? "bg-white/15 font-medium text-white" : "text-white/75 hover:bg-white/8 hover:text-white"
                          }`
                        }
                      >
                        {item.icon}
                        <span className="flex-1">{item.label}</span>
                        {count > 0 && (
                          <span className="rounded-full bg-teal-500 px-1.5 text-[11px] font-semibold text-teal-900" aria-label={`${count} waiting`}>
                            {count}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl bg-white/8 p-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-teal-500 text-xs font-semibold text-teal-900">{initials(admin?.name)}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium">{admin?.name}</div>
            <div className="truncate text-[11px] text-white/60">
              {admin && roleLabel[admin.role]}
              {admin?.cities?.length ? ` · ${admin.cities.map((c) => c.name).join(", ")}` : ""}
            </div>
          </div>
          <button onClick={() => signOut()} className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <div className="relative h-full w-64">
            <Sidebar onNavigate={() => setOpen(false)} />
            <button onClick={() => setOpen(false)} className="absolute top-4 -right-11 rounded-lg bg-white p-2 text-slate-700" aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
        <span className="text-sm font-semibold text-navy-700">PrimeCabs admin</span>
      </header>

      <main key={location.pathname} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
