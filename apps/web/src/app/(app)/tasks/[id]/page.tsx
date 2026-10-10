"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import { ApiError, projectsApi, tasksApi } from "@/lib/api";
import {
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  type MemberRow,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { errorMessage, formatDateTime, formatRelative, isOverdue } from "@/lib/format";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageLoader,
  PriorityBadge,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";

type State =
  | { status: "loading" }
  | { status: "ready"; task: TaskDetail }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string };

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const router = useRouter();
  const { toast } = useToast();

  const [state, setState] = useState<State>({ status: "loading" });
  const [conflict, setConflict] = useState<TaskDetail | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "TODO" as TaskStatus,
    priority: "MEDIUM" as TaskPriority,
    assigneeId: "",
    dueDate: "",
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);

  const load = useCallback(() => {
    tasksApi
      .get(taskId)
      .then(({ data }) => {
        setConflict(null);
        setState({ status: "ready", task: data });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "not-found", message: error.message });
          return;
        }
        setState({ status: "error", message: errorMessage(error, "Could not load the task.") });
      });
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  const canManage = state.status === "ready" && state.task.permissions.canEdit;

  useEffect(() => {
    if (!canManage || state.status !== "ready") return;
    projectsApi.members
      .list(state.task.projectId)
      .then((res) => setMembers(res.data))
      .catch(() => setMembers([]));
  }, [canManage, state]);

  function applyTask(next: TaskDetail) {
    setState({ status: "ready", task: next });
    setConflict(null);
  }

  async function changeStatus(status: TaskStatus) {
    if (state.status !== "ready") return;
    const { task } = state;
    if (status === task.status) return;
    setState({ status: "ready", task: { ...task, status } });
    try {
      const { data } = await tasksApi.update(task.id, { version: task.version, status });
      applyTask(data);
      toast(`Status set to ${TASK_STATUS_LABELS[status]}.`, "success");
    } catch (error) {
      setState({ status: "ready", task });
      handleUpdateError(error, "Could not change the status.");
    }
  }

  function handleUpdateError(error: unknown, fallback: string) {
    if (error instanceof ApiError && error.status === 409) {
      const latest = (error.meta?.task as TaskDetail | undefined) ?? null;
      setConflict(latest);
      toast("Edit conflict detected — review the latest version.", "warn");
      return;
    }
    toast(errorMessage(error, fallback), "error");
  }

  function openEdit(task: TaskDetail) {
    setForm({
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      assigneeId: task.assignee?.id ?? "",
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
    });
    setSaveError(null);
    setEditOpen(true);
  }

  async function handleSave() {
    if (state.status !== "ready" || saving) return;
    const { task } = state;
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await tasksApi.update(task.id, {
        version: task.version,
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
      });
      applyTask(data);
      setEditOpen(false);
      toast("Task updated.", "success");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setEditOpen(false);
        handleUpdateError(error, "");
        return;
      }
      setSaveError(errorMessage(error, "Could not save the task."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (saving || deleting) return;
    setDeleting(true);
    try {
      await tasksApi.remove(taskId);
      toast("Task deleted.", "success");
      router.push(`/projects/${state.status === "ready" ? state.task.projectId : ""}/tasks`);
    } catch (error) {
      toast(errorMessage(error, "Could not delete the task."), "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleComment() {
    const content = comment.trim();
    if (!content || commenting || state.status !== "ready") return;
    setCommenting(true);
    try {
      await tasksApi.comments.create(taskId, content);
      setComment("");
      const { data } = await tasksApi.get(taskId);
      applyTask(data);
    } catch (error) {
      toast(errorMessage(error, "Could not add the comment."), "error");
    } finally {
      setCommenting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    try {
      await tasksApi.comments.remove(taskId, commentId);
      const { data } = await tasksApi.get(taskId);
      applyTask(data);
    } catch (error) {
      toast(errorMessage(error, "Could not delete the comment."), "error");
    }
  }

  if (state.status === "loading") return <PageLoader />;

  if (state.status === "not-found") {
    return (
      <div className="space-y-4">
        <Alert tone="warn">{state.message}</Alert>
        <Link href="/projects">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to projects
          </Button>
        </Link>
      </div>
    );
  }

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

  const { task } = state;
  const overdue = isOverdue(task.dueDate, task.status);
  const boardHref = `/projects/${task.projectId}/tasks`;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={boardHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Task board
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">{task.title}</h1>
              <PriorityBadge priority={task.priority} />
            </div>
            <p className="mt-1 text-sm text-ink-faint">
              <Link
                href={`/projects/${task.projectId}`}
                className="font-medium text-brand-deep underline-offset-2 hover:underline"
              >
                {task.project.name}
              </Link>{" "}
              · {PROJECT_STATUS_LABELS[task.project.status as keyof typeof PROJECT_STATUS_LABELS] ??
                task.project.status}
            </p>
          </div>
          {task.permissions.canEdit ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => openEdit(task)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Edit task
              </Button>
              {task.permissions.canDelete ? (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {conflict ? (
        <Alert className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <strong>Edit conflict:</strong> {conflict.title} changed while you were editing (now
            “{TASK_STATUS_LABELS[conflict.status]}”, version {conflict.version}). Your change was
            not saved.
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConflict(null)}>
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => (conflict ? applyTask(conflict) : undefined)}
            >
              Load latest version
            </Button>
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main details */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Status</h2>
              <StatusBadge status={task.status} />
            </div>
            {task.permissions.canChangeStatus ? (
              <div className="mt-3">
                <Field label="Move to" htmlFor="status-select">
                  <Select
                    id="status-select"
                    value={task.status}
                    onChange={(event) => void changeStatus(event.target.value as TaskStatus)}
                  >
                    {TASK_STATUS_ORDER.map((value) => (
                      <option key={value} value={value}>
                        {TASK_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink-faint">
                You do not have permission to change task status in this project.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Description</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">
              {task.description || "No description provided."}
            </p>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-ink-faint">
                <UserRound className="h-3.5 w-3.5" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Assignee</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {task.assignee ? (
                  <>
                    <Avatar name={task.assignee.name} size="sm" />
                    <span className="truncate text-sm text-ink">{task.assignee.name}</span>
                  </>
                ) : (
                  <span className="text-sm text-ink-faint">Unassigned</span>
                )}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-ink-faint">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Due date</span>
              </div>
              <p className={`mt-2 text-sm font-medium ${overdue ? "text-danger" : "text-ink"}`}>
                {task.dueDate ? formatDateTime(task.dueDate) : "No due date"}
                {overdue ? " · overdue" : ""}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-1.5 text-ink-faint">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-wide">Updated</span>
              </div>
              <p className="mt-2 text-sm text-ink" title={formatDateTime(task.updatedAt)}>
                {formatRelative(task.updatedAt)}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                v{task.version} · {task.creator?.name ?? "Unknown"} created it
              </p>
            </Card>
          </div>
        </div>

        {/* Comments */}
        <Card className="flex h-fit flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-ink-faint" aria-hidden />
              <h2 className="text-sm font-semibold text-ink">Comments</h2>
            </div>
            <Badge tone="neutral">{task.comments.length}</Badge>
          </div>

          <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
            {task.comments.length === 0 ? (
              <li className="px-5 py-6 text-center text-xs text-ink-faint">
                No comments yet. Start the discussion.
              </li>
            ) : null}
            {task.comments.map((row) => (
              <li key={row.id} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <Avatar name={row.author.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink">
                      {row.author.name}
                      <span className="ml-1.5 font-normal text-ink-faint">
                        {formatRelative(row.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-soft">{row.content}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete comment"
                    className="rounded p-1 text-ink-faint transition-colors hover:bg-line/60 hover:text-danger"
                    onClick={() => void handleDeleteComment(row.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {task.permissions.canComment ? (
            <div className="border-t border-line p-4">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Write a comment…"
                aria-label="Write a comment"
                maxLength={2000}
                className="min-h-20"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleComment()}
                  loading={commenting}
                  disabled={!comment.trim()}
                >
                  <Send className="h-3.5 w-3.5" aria-hidden />
                  Comment
                </Button>
              </div>
            </div>
          ) : (
            <p className="border-t border-line px-5 py-3 text-xs text-ink-faint">
              Your role is read-only — commenting is disabled.
            </p>
          )}
        </Card>
      </div>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit task"
        description="Saves are guarded by optimistic locking — a conflict reloads the latest version."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!form.title.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveError ? <Alert>{saveError}</Alert> : null}
          <Field label="Title" htmlFor="edit-title" error={null}>
            <Input
              id="edit-title"
              value={form.title}
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
              maxLength={200}
            />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              maxLength={5000}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Status" htmlFor="edit-status">
              <Select
                id="edit-status"
                value={form.status}
                onChange={(event) => setForm((f) => ({ ...f, status: event.target.value as TaskStatus }))}
              >
                {TASK_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="edit-priority">
              <Select
                id="edit-priority"
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
            <Field label="Due date" htmlFor="edit-due">
              <Input
                id="edit-due"
                type="date"
                value={form.dueDate}
                onChange={(event) => setForm((f) => ({ ...f, dueDate: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Assignee" htmlFor="edit-assignee" hint="Must be a project member">
            <Select
              id="edit-assignee"
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

      {/* Delete confirmation */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this task?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleDelete()} loading={deleting}>
              Delete task
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          “{task.title}” and its comments will be removed permanently. This is recorded in the
          activity history.
        </p>
      </Modal>
    </div>
  );
}
