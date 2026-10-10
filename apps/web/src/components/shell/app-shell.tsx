"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "./session";
import { Header, ShellError } from "./header";
import { Sidebar } from "./sidebar";
import { Spinner } from "@/components/ui";

export function AppShell({ children }: { children: ReactNode }) {
  const { state, refresh } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Loading NeoStats" />
      </div>
    );
  }

  if (state.status === "error") {
    return <ShellError message={state.message} onRetry={() => void refresh()} />;
  }

  if (state.status === "unauthenticated") {
    // A redirect to /login is already in flight.
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Spinner label="Redirecting to login" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar mobileOpen={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-64">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
