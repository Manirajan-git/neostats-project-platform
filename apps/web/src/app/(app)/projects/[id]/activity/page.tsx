"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { ApiError, projectsApi } from "@/lib/api";
import type { ActivityRow } from "@/lib/types";
import { errorMessage, formatDateTime } from "@/lib/format";
import { Alert, Avatar, Button, Card, EmptyState, PageLoader, Pagination } from "@/components/ui";
import { ProjectTabs } from "@/components/project-tabs";

type State =
  | { status: "loading" }
  | { status: "ready"; rows: ActivityRow[]; meta: { page: number; totalPages: number; total: number } }
  | { status: "error"; message: string };

export default function ProjectActivityPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [state, setState] = useState<State>({ status: "loading" });
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    projectsApi
      .activity(projectId, { page, limit: 25 })
      .then(({ data, meta }) =>
        setState({
          status: "ready",
          rows: data,
          meta: { page: meta.page, totalPages: meta.totalPages, total: meta.total },
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "error", message: error.message });
          return;
        }
        setState({ status: "error", message: errorMessage(error, "Could not load activity.") });
      });
  }, [projectId, page]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Project overview
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Activity history</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Every change made in this project, newest first.
        </p>
      </div>

      <ProjectTabs projectId={projectId} active="activity" />

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
          icon={<History className="h-8 w-8" aria-hidden />}
          title="No activity yet"
          hint="Task updates, comments, membership changes and project edits will appear here."
        />
      ) : null}

      {state.status === "ready" && state.rows.length > 0 ? (
        <>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {state.rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-5 py-3.5">
                  {row.actor ? (
                    <Avatar name={row.actor.name} size="sm" />
                  ) : (
                    <span className="h-6 w-6 shrink-0 rounded-full bg-line" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{row.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {row.action} · {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-faint">
                    {row.entityType}
                  </span>
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
        </>
      ) : null}
    </div>
  );
}
