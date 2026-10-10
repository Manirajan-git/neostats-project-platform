import type { ReactNode } from "react";
import { SessionProvider } from "@/components/shell/session";
import { AppShell } from "@/components/shell/app-shell";
import { ToastProvider } from "@/components/toast";

export default function AppAreaLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </SessionProvider>
  );
}
