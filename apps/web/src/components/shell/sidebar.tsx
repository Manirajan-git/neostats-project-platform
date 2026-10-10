"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderKanban,
  LayoutDashboard,
  Users,
  X,
  Bell,
} from "lucide-react";
import { useSession } from "./session";
import { Avatar } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: (role: string) => boolean;
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    show: () => true,
    match: (path) => path === "/dashboard",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: FolderKanban,
    show: () => true,
    match: (path) => path.startsWith("/projects"),
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    show: () => true,
    match: (path) => path.startsWith("/notifications"),
  },
  {
    href: "/users",
    label: "Users",
    icon: Users,
    show: (role) => role === "ADMIN",
    match: (path) => path.startsWith("/users"),
  },
];

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, unreadCount } = useSession();
  if (!user) return null;

  const nav = (
    <div className="flex h-full flex-col bg-shell text-white">
      <div className="flex items-center justify-between gap-2 px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-black text-brand-deep">
            N
          </span>
          <span>
            <span className="block text-sm font-bold tracking-tight">NeoStats</span>
            <span className="block text-[10px] uppercase tracking-[0.14em] text-white/45">
              Project Platform
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.filter((item) => item.show(user.role)).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand/15 text-brand"
                  : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.href === "/notifications" && unreadCount > 0 ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-brand-deep">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-white/50">{ROLE_LABELS[user.role]}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{nav}</aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-shell/50"
            tabIndex={-1}
          />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            {nav}
          </aside>
        </div>
      ) : null}
    </>
  );
}
