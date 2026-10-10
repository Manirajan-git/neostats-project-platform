import { Suspense } from "react";
import HealthPanel from "@/components/health-panel";
import HealthPanelSkeleton from "@/components/health-panel-skeleton";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 font-sans dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              NS
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                NeoStats
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Collaborative Project Management Platform
              </p>
            </div>
          </div>
          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Phase 1 · Foundation
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          System status
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Live health of the frontend, API and database. Real-time and product
          UI arrive in later phases.
        </p>

        <div className="mt-6">
          <Suspense fallback={<HealthPanelSkeleton />}>
            <HealthPanel />
          </Suspense>
        </div>
      </main>

      <footer className="border-t border-zinc-200 bg-white px-6 py-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        NeoStats Hackathon · Next.js + Express + PostgreSQL
      </footer>
    </div>
  );
}
