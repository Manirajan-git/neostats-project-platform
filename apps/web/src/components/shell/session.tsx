"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, authApi, notificationsApi } from "@/lib/api";
import type { SafeUser } from "@/lib/types";

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; user: SafeUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

interface SessionContextValue {
  state: SessionState;
  user: SafeUser | null;
  unreadCount: number;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>.");
  return ctx;
}

/**
 * Loads the current user once, exposes unread notifications (polled every 60s)
 * and centralises logout. Any 401 anywhere redirects to /login exactly once.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [unreadCount, setUnreadCount] = useState(0);
  const redirecting = useRef(false);

  const load = useCallback(() => {
    authApi
      .me()
      .then(({ user }) => {
        setState({ status: "authenticated", user });
        notificationsApi
          .unreadCount()
          .then((res) => setUnreadCount(res.unreadCount))
          .catch(() => setUnreadCount(0));
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: "unauthenticated" });
          if (!redirecting.current) {
            redirecting.current = true;
            router.replace("/login");
          }
          return;
        }
        setState({
          status: "error",
          message: error instanceof ApiError ? error.message : "Could not load your session.",
        });
      });
  }, [router]);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await notificationsApi.unreadCount();
      setUnreadCount(res.unreadCount);
    } catch {
      /* keep the last known count; the next poll corrects it */
    }
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setState({ status: "unauthenticated" });
    redirecting.current = true;
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Polling (not push): the badge refreshes once a minute while a tab is open.
  useEffect(() => {
    if (state.status !== "authenticated") return;
    const timer = setInterval(() => void refreshUnread(), 60_000);
    return () => clearInterval(timer);
  }, [state.status, refreshUnread]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      user: state.status === "authenticated" ? state.user : null,
      unreadCount,
      refresh: async () => {
        load();
      },
      refreshUnread,
      logout,
    }),
    [state, unreadCount, load, refreshUnread, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
