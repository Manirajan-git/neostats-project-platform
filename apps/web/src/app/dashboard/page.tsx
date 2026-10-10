"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi, ApiError } from "@/lib/api";
import { ROLE_LABELS, type SafeUser } from "@/lib/types";

type State =
  | { status: "loading" }
  | { status: "authenticated"; user: SafeUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const loadUser = useCallback(() => {
    // Promise callbacks keep setState out of the synchronous effect body.
    return authApi
      .me()
      .then(({ user }) => {
        setState({ status: "authenticated", user });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "unauthenticated" });
          void router.replace("/login");
          return;
        }
        setState({
          status: "error",
          message: error instanceof ApiError ? error.message : "Something went wrong.",
        });
      });
  }, [router]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function handleLogout() {
    if (loggingOut) return;
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await authApi.logout();
      setState({ status: "unauthenticated" });
      router.push("/login");
    } catch (error) {
      // Only clear local state if the server really confirmed logout.
      setLogoutError(
        error instanceof ApiError ? error.message : "Logout failed. Please try again.",
      );
      setLoggingOut(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600/30 border-t-indigo-600"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-zinc-950">
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {state.message}
        </p>
        <button
          onClick={() => {
            setState({ status: "loading" });
            void loadUser();
          }}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return null;
  }

  const { user } = state;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
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
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              System status
            </Link>
            <button
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome, {user.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          You are signed in. Projects, tasks and team collaboration arrive in later phases.
        </p>

        {logoutError ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
          >
            {logoutError}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Signed in as</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {user.email}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
              {ROLE_LABELS[user.role]}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Account</p>
            <dl className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Status</dt>
                <dd className={user.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                  {user.isActive ? "Active" : "Deactivated"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500 dark:text-zinc-400">Member since</dt>
                <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </main>
    </div>
  );
}
