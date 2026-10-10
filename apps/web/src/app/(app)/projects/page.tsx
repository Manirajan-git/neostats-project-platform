"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, FolderPlus, Search } from "lucide-react";
import { projectsApi, usersApi } from "@/lib/api";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
  type ProjectSummary,
  type SafeUser,
} from "@/lib/types";
import { errorMessage, formatRelative } from "@/lib/format";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageLoader,
  Pagination,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/shell/session";

type State =
  | { status: "loading" }
  | { status: "ready"; projects: ProjectSummary[]; meta: { page: number; totalPages: number; total: number } }
  | { status: "error"; message: string };

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  ...Object.entries(PROJECT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

export default function ProjectsPage() {
  const router = useRouter();
  const { user } = useSession();
  const { toast } = useToast();
  const isAdmin = user?.role === "ADMIN";

  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", managerId: "" });
  const [directory, setDirectory] = useState<Pick<SafeUser, "id" | "name" | "email">[]>([]);

  // Deep links: /projects?status=ARCHIVED and /projects?new=1 (admin shortcut).
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const statusParam = query.get("status");
      if (statusParam) setStatus(statusParam);
      if (query.get("new") === "1" && user?.role === "ADMIN") setCreateOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [user]);

  const load = useCallback(() => {
    projectsApi
      .list({ page, limit: 12, q: search || undefined, status: (status || undefined) as ProjectStatus | undefined })
      .then(({ data, meta }) =>
        setState({
          status: "ready",
          projects: data,
          meta: { page: meta.page, totalPages: meta.totalPages, total: meta.total },
        }),
      )
      .catch((error: unknown) =>
        setState({ status: "error", message: errorMessage(error, "Could not load projects.") }),
      );
  }, [page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  // Search as you type, debounced.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!createOpen || !isAdmin) return;
    usersApi
      .directory()
      .then((res) => setDirectory(res.data))
      .catch(() => setDirectory([]));
  }, [createOpen, isAdmin]);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { data } = await projectsApi.create({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        managerId: form.managerId || undefined,
      });
      toast(`Project "${data.name}" created.`, "success");
      setCreateOpen(false);
      setForm({ name: "", description: "", managerId: "" });
      router.push(`/projects/${data.id}`);
    } catch (error) {
      setCreateError(errorMessage(error, "Could not create the project."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Projects</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {state.status === "ready"
              ? `${state.meta.total} project${state.meta.total === 1 ? "" : "s"} you can access`
              : "Every project you are a member of or manage."}
          </p>
        </div>
        {isAdmin ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <FolderPlus className="h-4 w-4" aria-hidden />
            New project
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
            className="pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="sm:w-48"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {state.status === "loading" ? <PageLoader /> : null}

      {state.status === "error" ? (
        <div className="space-y-3">
          <Alert>{state.message}</Alert>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ready" && state.projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" aria-hidden />}
          title={search || status ? "No projects match your filters" : "No projects yet"}
          hint={
            search || status
              ? "Try a different search term or clear the status filter."
              : isAdmin
                ? "Create your first project to start tracking work with your team."
                : "You will see projects here once an administrator or manager adds you to one."
          }
          action={
            isAdmin && !search && !status ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <FolderPlus className="h-4 w-4" aria-hidden />
                New project
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {state.status === "ready" && state.projects.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {state.projects.map((project) => {
              const done = project.taskCounts.DONE;
              const total = project.taskCounts.total;
              const percent = total === 0 ? 0 : Math.round((done / total) * 100);
              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="group">
                  <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-brand/60">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="line-clamp-1 text-sm font-semibold text-ink group-hover:text-brand-deep">
                        {project.name}
                      </h2>
                      <StatusBadge status={project.status} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 min-h-9 text-xs text-ink-faint">
                      {project.description || "No description provided."}
                    </p>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-[11px] text-ink-faint">
                        <span>
                          {done}/{total} tasks done
                        </span>
                        <span>{percent}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                          className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                      <div className="flex items-center gap-2">
                        {project.manager ? (
                          <>
                            <Avatar name={project.manager.name} size="sm" />
                            <span className="max-w-32 truncate text-xs text-ink-soft">
                              {project.manager.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-ink-faint">Unassigned manager</span>
                        )}
                      </div>
                      <span className="text-[11px] text-ink-faint">
                        {project.memberCount} member{project.memberCount === 1 ? "" : "s"} ·{" "}
                        {formatRelative(project.updatedAt)}
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          <Card className="overflow-hidden">
            <Pagination
              page={state.meta.page}
              totalPages={state.meta.totalPages}
              total={state.meta.total}
              onChange={setPage}
            />
          </Card>
        </>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        description="Projects start active. Only administrators can create them."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              loading={creating}
              disabled={!form.name.trim()}
            >
              Create project
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError ? <Alert>{createError}</Alert> : null}
          <Field label="Project name" htmlFor="project-name" error={null}>
            <Input
              id="project-name"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              placeholder="e.g. Data Platform Migration"
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Description" htmlFor="project-description" hint="Optional">
            <Textarea
              id="project-description"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              placeholder="What is this project about?"
              maxLength={2000}
            />
          </Field>
          <Field label="Project manager" htmlFor="project-manager" hint="Defaults to you">
            <Select
              id="project-manager"
              value={form.managerId}
              onChange={(event) => setForm((f) => ({ ...f, managerId: event.target.value }))}
            >
              <option value="">{user?.name ?? "Me"}</option>
              {directory
                .filter((person) => person.id !== user?.id)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.email})
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
