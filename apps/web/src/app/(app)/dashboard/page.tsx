"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CircleAlert,
  FolderPlus,
  History,
  ListChecks,
  FolderKanban,
  Users,
} from "lucide-react";
import { dashboardApi } from "@/lib/api";
import { ROLE_LABELS, TASK_STATUS_LABELS, type DashboardData, type ProjectStatus } from "@/lib/types";
import { errorMessage, formatRelative, isOverdue } from "@/lib/format";
import { Alert, Button, Card, EmptyState, PageLoader, PriorityBadge, StatusBadge } from "@/components/ui";
import { useSession } from "@/components/shell/session";

type State =
  | { status: "loading" }
  | { status: "ready"; data: DashboardData }
  | { status: "error"; message: string };

const STATUS_FILTERS: { key: ProjectStatus; label: string }[] = [
  { key: "ACTIVE", label: "Active" },
  { key: "ON_HOLD", label: "On hold" },
  { key: "COMPLETED", label: "Completed" },
  { key: "ARCHIVED", label: "Archived" },
];

export default function DashboardPage() {
  const { user } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | undefined>();

  const load = useCallback(() => {
    dashboardApi
      .get()
      .then(({ data }) => setState({ status: "ready", data }))
      .catch((error: unknown) =>
        setState({ status: "error", message: errorMessage(error, "Could not load the dashboard.") }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  if (state.status === "loading") return <PageLoader />;

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Alert>{state.message}</Alert>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const { data } = state;
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-ink-faint">
            {user ? `${ROLE_LABELS[user.role]} · ` : ""}real-time summary of your projects and work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/projects">
            <Button variant="secondary" size="sm">
              <FolderKanban className="h-4 w-4" aria-hidden />
              Browse projects
            </Button>
          </Link>
          {isAdmin ? (
            <Link href="/projects?new=1">
              <Button variant="primary" size="sm">
                <FolderPlus className="h-4 w-4" aria-hidden />
                New project
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Projects</p>
          <p className="mt-2 text-3xl font-bold text-ink">{data.projects.total}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(statusFilter === key ? undefined : key)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  statusFilter === key
                    ? "border-brand bg-brand-soft text-brand-deep"
                    : "border-line bg-surface-2 text-ink-faint hover:text-ink"
                }`}
              >
                {label} {data.projects[
                  key === "ACTIVE"
                    ? "active"
                    : key === "ON_HOLD"
                      ? "onHold"
                      : key === "COMPLETED"
                        ? "completed"
                        : "archived"
                ]}
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Tasks {isAdmin ? "(all projects)" : "(your projects)"}
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{data.tasks.total}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(Object.keys(TASK_STATUS_LABELS) as (keyof typeof TASK_STATUS_LABELS)[]).map((key) => (
              <span
                key={key}
                className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-faint"
              >
                {TASK_STATUS_LABELS[key]} {data.tasks.byStatus[key]}
              </span>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">My tasks</p>
          <p className="mt-2 text-3xl font-bold text-ink">{data.tasks.assignedToMe.total}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-faint">
              Due in 7 days {data.tasks.assignedToMe.dueSoon}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                data.tasks.assignedToMe.overdue > 0
                  ? "border-danger/40 bg-danger-soft text-danger"
                  : "border-line bg-surface-2 text-ink-faint"
              }`}
            >
              Overdue {data.tasks.assignedToMe.overdue}
            </span>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Unread notifications
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{data.unreadNotifications}</p>
          <Link
            href="/notifications"
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
          >
            Open notifications <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </Card>
      </div>

      {statusFilter ? (
        <Alert tone="info" className="flex items-center justify-between gap-3">
          <span>
            Filtered to <strong>{STATUS_FILTERS.find((f) => f.key === statusFilter)?.label}</strong>{" "}
            projects.
          </span>
          <Link href={`/projects?status=${statusFilter}`}>
            <span className="font-semibold underline underline-offset-2">View in projects</span>
          </Link>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-ink-faint" aria-hidden />
              <h2 className="text-sm font-semibold text-ink">Upcoming deadlines</h2>
            </div>
            <span className="text-xs text-ink-faint">Next 14 days</span>
          </div>
          {data.upcomingDeadlines.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<CalendarClock className="h-7 w-7" aria-hidden />}
                title="No deadlines coming up"
                hint="Tasks with a due date in the next two weeks will appear here."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.upcomingDeadlines.map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                      <p className="mt-0.5 truncate text-xs text-ink-faint">{task.projectName}</p>
                    </div>
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                    <span
                      className={`w-24 shrink-0 text-right text-xs font-medium ${
                        isOverdue(task.dueDate, task.status) ? "text-danger" : "text-ink-soft"
                      }`}
                    >
                      {formatRelative(task.dueDate)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-ink-faint" aria-hidden />
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
            </div>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<History className="h-7 w-7" aria-hidden />}
                title="No activity yet"
                hint="Project, task and comment changes will show up here as your team works."
              />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.recentActivity.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{row.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {row.projectName ? `${row.projectName} · ` : ""}
                      {formatRelative(row.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Shortcuts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/notifications" className="group">
          <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-brand/60">
            <Bell className="h-5 w-5 text-ink-faint" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              <p className="text-xs text-ink-faint">{data.unreadNotifications} unread</p>
            </div>
          </Card>
        </Link>
        <Link href="/profile" className="group">
          <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-brand/60">
            <ListChecks className="h-5 w-5 text-ink-faint" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-ink">Your profile</p>
              <p className="text-xs text-ink-faint">Update your display name</p>
            </div>
          </Card>
        </Link>
        {isAdmin ? (
          <Link href="/users" className="group">
            <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-brand/60">
              <Users className="h-5 w-5 text-ink-faint" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Manage users</p>
                <p className="text-xs text-ink-faint">Roles and access</p>
              </div>
            </Card>
          </Link>
        ) : null}
        {data.tasks.assignedToMe.overdue > 0 ? (
          <Link href="/projects" className="group">
            <Card className="flex items-center gap-3 border-danger/40 bg-danger-soft p-4 transition-colors group-hover:border-danger">
              <CircleAlert className="h-5 w-5 text-danger" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-danger">Overdue work</p>
                <p className="text-xs text-danger/80">
                  {data.tasks.assignedToMe.overdue} task(s) past due
                </p>
              </div>
            </Card>
          </Link>
        ) : (
          <Link href="/projects" className="group">
            <Card className="flex items-center gap-3 p-4 transition-colors group-hover:border-brand/60">
              <FolderKanban className="h-5 w-5 text-ink-faint" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">All projects</p>
                <p className="text-xs text-ink-faint">
                  {data.projects.managed} managed by you
                </p>
              </div>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
