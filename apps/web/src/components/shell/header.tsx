"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronRight, LogOut, Menu, UserRound } from "lucide-react";
import { useSession } from "./session";
import { Avatar, Button } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  projects: "Projects",
  tasks: "Task",
  team: "Team",
  activity: "Activity",
  users: "Users",
  notifications: "Notifications",
  profile: "Profile",
};

function useBreadcrumbs(): { label: string; href: string }[] {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  return segments.map((segment, index) => ({
    label: SEGMENT_LABELS[segment] ?? decodeURIComponent(segment),
    href: `/${segments.slice(0, index + 1).join("/")}`,
  }));
}

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { user, unreadCount, logout, refreshUnread } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevPathname, setPrevPathname] = useState(pathname);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const crumbs = useBreadcrumbs();

  // Close the account menu when the route changes (adjust-during-render).
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  if (!user) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-line/70 hover:text-ink lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex items-center gap-1.5 overflow-hidden text-sm">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
                  ) : null}
                  {isLast ? (
                    <span className="truncate font-semibold text-ink">{crumb.label}</span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="truncate text-ink-soft transition-colors hover:text-ink"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <Link
          href="/notifications"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
          }
          className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-line/70 hover:text-ink"
          onClick={() => void refreshUnread()}
        >
          <Bell className="h-5 w-5" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold leading-4 text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 transition-colors hover:bg-surface-2"
          >
            <Avatar name={user.name} size="sm" />
            <span className="hidden text-left sm:block">
              <span className="block max-w-40 truncate text-xs font-semibold text-ink">
                {user.name}
              </span>
              <span className="block text-[10px] text-ink-faint">{ROLE_LABELS[user.role]}</span>
            </span>
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="animate-fade-in absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
            >
              <div className="border-b border-line px-3 py-2.5">
                <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-faint">{user.email}</p>
              </div>
              <Link
                href="/profile"
                role="menuitem"
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <UserRound className="h-4 w-4" aria-hidden />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger-soft disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** Fallback error surface used when the shell itself fails to load. */
export function ShellError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4">
      <p role="alert" className="text-sm text-danger">
        {message}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
        <Button variant="ghost" onClick={() => router.push("/login")}>
          Back to login
        </Button>
      </div>
    </div>
  );
}
