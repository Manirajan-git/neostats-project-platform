"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Filter } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import type { NotificationRow } from "@/lib/types";
import { errorMessage, formatRelative } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  PageLoader,
  Pagination,
} from "@/components/ui";
import { useToast } from "@/components/toast";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      rows: NotificationRow[];
      unreadCount: number;
      meta: { page: number; totalPages: number; total: number };
    }
  | { status: "error"; message: string };

export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(() => {
    notificationsApi
      .list({ page, limit: 20, unreadOnly: unreadOnly || undefined })
      .then(({ data, meta, unreadCount }) =>
        setState({
          status: "ready",
          rows: data,
          unreadCount,
          meta: { page: meta.page, totalPages: meta.totalPages, total: meta.total },
        }),
      )
      .catch((error: unknown) =>
        setState({ status: "error", message: errorMessage(error, "Could not load notifications.") }),
      );
  }, [page, unreadOnly]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  async function openNotification(row: NotificationRow) {
    if (!row.read) {
      setBusyId(row.id);
      try {
        await notificationsApi.markRead(row.id);
      } catch {
        // Navigation still proceeds; count refreshes on next load.
      } finally {
        setBusyId(null);
      }
    }
    if (row.entityType === "TASK" && row.entityId) router.push(`/tasks/${row.entityId}`);
    else if (row.projectId) router.push(`/projects/${row.projectId}`);
    else load();
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const { updated } = await notificationsApi.markAllRead();
      toast(`Marked ${updated} notification${updated === 1 ? "" : "s"} as read.`, "success");
      setPage(1);
      load();
    } catch (error) {
      toast(errorMessage(error, "Could not mark notifications as read."), "error");
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Notifications</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {state.status === "ready"
              ? `${state.unreadCount} unread · ${state.meta.total} total`
              : "Updates about assignments, comments and project changes."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={unreadOnly ? "primary" : "secondary"}
            size="sm"
            onClick={() => {
              setPage(1);
              setUnreadOnly((value) => !value);
            }}
          >
            <Filter className="h-4 w-4" aria-hidden />
            {unreadOnly ? "Showing unread" : "Unread only"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void markAllRead()}
            loading={markingAll}
            disabled={state.status === "ready" && state.unreadCount === 0}
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all read
          </Button>
        </div>
      </div>

      {state.status === "loading" ? <PageLoader /> : null}

      {state.status === "error" ? (
        <div className="space-y-4">
          <Alert>{state.message}</Alert>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ready" && state.rows.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-8 w-8" aria-hidden />}
          title={unreadOnly ? "No unread notifications" : "You're all caught up"}
          hint={
            unreadOnly
              ? "Switch back to see your full history."
              : "You'll be notified when you're assigned a task, when someone comments on your work, or when project settings change."
          }
        />
      ) : null}

      {state.status === "ready" && state.rows.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {state.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void openNotification(row)}
                  disabled={busyId === row.id}
                  className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2 ${
                    row.read ? "opacity-70" : ""
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      row.read ? "bg-line-strong" : "bg-brand"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{row.message}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {row.type.replaceAll("_", " ").toLowerCase()} · {formatRelative(row.createdAt)}
                    </p>
                  </div>
                  {!row.read ? <Badge tone="brand">New</Badge> : null}
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            page={state.meta.page}
            totalPages={state.meta.totalPages}
            total={state.meta.total}
            onChange={setPage}
          />
        </Card>
      ) : null}
    </div>
  );
}
