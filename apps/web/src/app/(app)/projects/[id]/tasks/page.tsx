"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MessageSquare,
  Plus,
  Search,
} from "lucide-react";
import { ApiError, projectsApi, tasksApi } from "@/lib/api";
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_LABELS,
  type MemberRow,
  type ProjectDetail,
  type ProjectPermissions,
  type TaskPriority,
  type TaskSummary,
  type TaskStatus,
} from "@/lib/types";
import { errorMessage, formatRelative, isOverdue } from "@/lib/format";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageLoader,
  PriorityBadge,
  Select,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { ProjectTabs } from "@/components/project-tabs";

type State =
  | { status: "loading" }
  | {
      status: "ready";
      project: ProjectDetail;
      tasks: TaskSummary[];
      total: number;
      members: MemberRow[];
      permissions: ProjectPermissions;
    }
  | { status: "error"; message: string };

const PRIORITY_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All priorities" },
  ...Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
];

const COLUMN_STYLES: Record<TaskStatus, { accent: string; soft: string }> = {
  TODO: { accent: "bg-ink-faint", soft: "bg-line/60" },
  IN_PROGRESS: { accent: "bg-info", soft: "bg-info-soft" },
  BLOCKED: { accent: "bg-danger", soft: "bg-danger-soft" },
  DONE: { accent: "bg-ok", soft: "bg-ok-soft" },
};

export default function ProjectTasksPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { toast } = useToast();

  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "TODO" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
    assigneeId: "",
    dueDate: "",
  });

  const [movingId, setMovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      projectsApi.get(projectId),
      projectsApi.tasks.list(projectId, {
        limit: 100,
        q: search || undefined,
        priority: (priority || undefined) as TaskPriority | undefined,
        assigneeId: assigneeId || undefined,
      }),
      projectsApi.members.list(projectId),
    ])
      .then(([projectRes, tasksRes, membersRes]) =>
        setState({
          status: "ready",
          project: projectRes.data,
          tasks: tasksRes.data,
          total: tasksRes.meta.total,
          members: membersRes.data,
          permissions: {
            canManage: tasksRes.permissions.canManage,
            canChangeStatus: tasksRes.permissions.canChangeStatus,
            canComment: tasksRes.permissions.canComment,
          },
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "error", message: error.message });
          return;
        }
        setState({ status: "error", message: errorMessage(error, "Could not load tasks.") });
      });
  }, [projectId, search, priority, assigneeId]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  const columns = useMemo(() => {
    const map: Record<TaskStatus, TaskSummary[]> = { TODO: [], IN_PROGRESS: [], BLOCKED: [], DONE: [] };
    if (state.status === "ready") {
      for (const task of state.tasks) map[task.status].push(task);
    }
    return map;
  }, [state]);

  async function moveStatus(task: TaskSummary, direction: -1 | 1) {
    const index = TASK_STATUS_ORDER.indexOf(task.status);
    const next = TASK_STATUS_ORDER[index + direction];
    if (!next || movingId) return;

    setMovingId(task.id);
    // Optimistic move, then reconcile with the server.
    const snapshot = state.status === "ready" ? state.tasks : [];
    if (state.status === "ready") {
      setState({ ...state, tasks: state.tasks.map((t) => (t.id === task.id ? { ...t, status: next } : t)) });
    }
    try {
      const { data } = await tasksApi.update(task.id, { version: task.version, status: next });
      if (state.status === "ready") {
        setState({ ...state, tasks: state.tasks.map((t) => (t.id === data.id ? data : t)) });
      }
      toast(`Moved to ${TASK_STATUS_LABELS[next]}.`, "success");
    } catch (error) {
      if (state.status === "ready") setState({ ...state, tasks: snapshot });
      if (error instanceof ApiError && error.status === 409) {
        toast("Someone else updated this task first — refreshing the board.", "warn");
        load();
      } else {
        toast(errorMessage(error, "Could not move the task."), "error");
      }
    } finally {
      setMovingId(null);
    }
  }

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      await projectsApi.tasks.create(projectId, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
      });
      toast(`Task "${form.title.trim()}" created.`, "success");
      setCreateOpen(false);
      setForm({
        title: "",
        description: "",
        status: "TODO",
        priority: "MEDIUM",
        assigneeId: "",
        dueDate: "",
      });
      load();
    } catch (error) {
      setCreateError(errorMessage(error, "Could not create the task."));
    } finally {
      setCreating(false);
    }
  }

  if (state.status === "loading") return <PageLoader />;

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Alert>{state.message}</Alert>
        <Link href="/projects">
          <Button variant="secondary">Back to projects</Button>
        </Link>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const { project, members, permissions, total } = state;
  const canCreate = permissions.canManage;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Task board</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {project.name} · {total} task{total === 1 ? "" : "s"}
            {total > state.tasks.length ? ` · showing first ${state.tasks.length}` : ""}
          </p>
        </div>
        {canCreate ? (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New task
          </Button>
        ) : null}
      </div>

      <ProjectTabs projectId={projectId} active="tasks" />

      {!permissions.canChangeStatus ? (
        <Alert tone="info">
          You have read-only access to this board — task status and content are managed by project
          managers.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search task titles…"
            aria-label="Search tasks"
            className="pl-9"
          />
        </div>
        <Select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          aria-label="Filter by priority"
          className="sm:w-44"
        >
          {PRIORITY_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          aria-label="Filter by assignee"
          className="sm:w-48"
        >
          <option value="">All assignees</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>
              {member.user.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {TASK_STATUS_ORDER.map((status) => {
          const tasks = columns[status];
          const style = COLUMN_STYLES[status];
          return (
            <div key={status} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                <span className={`h-2 w-2 rounded-full ${style.accent}`} aria-hidden />
                <h2 className="text-sm font-semibold text-ink">{TASK_STATUS_LABELS[status]}</h2>
                <Badge tone="neutral" className="ml-auto">
                  {tasks.length}
                </Badge>
              </div>

              <div className={`flex flex-1 flex-col gap-3 rounded-xl border border-dashed ${style.soft} p-2`}>
                {tasks.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-ink-faint">No tasks here.</p>
                ) : null}
                {tasks.map((task) => {
                  const overdue = isOverdue(task.dueDate, task.status);
                  const moving = movingId === task.id;
                  return (
                    <Card
                      key={task.id}
                      className={`p-3 transition-opacity ${moving ? "opacity-60" : ""}`}
                    >
                      <Link href={`/tasks/${task.id}`} className="block group">
                        <p className="line-clamp-2 text-sm font-medium text-ink group-hover:text-brand-deep">
                          {task.title}
                        </p>
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={task.priority} />
                        {task.dueDate ? (
                          <Badge tone={overdue ? "danger" : "neutral"}>
                            {overdue ? <CircleAlert className="h-3 w-3" aria-hidden /> : null}
                            {formatRelative(task.dueDate)}
                          </Badge>
                        ) : null}
                        {task.commentCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-ink-faint">
                            <MessageSquare className="h-3 w-3" aria-hidden />
                            {task.commentCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {task.assignee ? (
                            <>
                              <Avatar name={task.assignee.name} size="sm" />
                              <span className="truncate text-[11px] text-ink-faint">
                                {task.assignee.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-ink-faint">Unassigned</span>
                          )}
                        </div>
                        {permissions.canChangeStatus ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              aria-label={`Move ${task.title} left`}
                              disabled={TASK_STATUS_ORDER.indexOf(status) === 0 || moving}
                              onClick={() => void moveStatus(task, -1)}
                              className="rounded-md border border-line bg-surface-2 p-1 text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${task.title} right`}
                              disabled={
                                TASK_STATUS_ORDER.indexOf(status) === TASK_STATUS_ORDER.length - 1 ||
                                moving
                              }
                              onClick={() => void moveStatus(task, 1)}
                              className="rounded-md border border-line bg-surface-2 p-1 text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                            >
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {total > 0 && state.tasks.length === 0 && (search || priority || assigneeId) ? (
        <EmptyState
          icon={<Search className="h-8 w-8" aria-hidden />}
          title="No tasks match your filters"
          hint="Try clearing the search box or filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setPriority("");
                setAssigneeId("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : null}

      {/* Create task modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New task"
        description={`Add work to ${project.name}.`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              loading={creating}
              disabled={!form.title.trim()}
            >
              Create task
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError ? <Alert>{createError}</Alert> : null}
          <Field label="Title" htmlFor="task-title" error={null}>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
              placeholder="What needs to be done?"
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="Description" htmlFor="task-description" hint="Optional">
            <Textarea
              id="task-description"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              maxLength={5000}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" htmlFor="task-status">
              <Select
                id="task-status"
                value={form.status}
                onChange={(event) =>
                  setForm((f) => ({ ...f, status: event.target.value as TaskStatus }))
                }
              >
                {TASK_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="task-priority">
              <Select
                id="task-priority"
                value={form.priority}
                onChange={(event) =>
                  setForm((f) => ({ ...f, priority: event.target.value as TaskPriority }))
                }
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date" htmlFor="task-due" hint="Optional">
              <Input
                id="task-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((f) => ({ ...f, dueDate: event.target.value }))}
              />
            </Field>
          </div>
          <Field
            label="Assignee"
            htmlFor="task-assignee"
            hint="Must be a member of this project"
          >
            <Select
              id="task-assignee"
              value={form.assigneeId}
              onChange={(event) => setForm((f) => ({ ...f, assigneeId: event.target.value }))}
            >
              <option value="">— Unassigned —</option>
              {members.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.name} ({member.user.email})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
