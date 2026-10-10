"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Archive,
  ArchiveRestore,
  CalendarClock,
  History,
  ListChecks,
  Pencil,
  Users,
} from "lucide-react";
import { ApiError, projectsApi, usersApi } from "@/lib/api";
import {
  PROJECT_STATUS_LABELS,
  type ActivityRow,
  type MemberRow,
  type ProjectDetail,
  type ProjectStatus,
  type SafeUser,
} from "@/lib/types";
import { errorMessage, formatRelative } from "@/lib/format";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageLoader,
  ProjectRoleBadge,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/shell/session";
import { ProjectTabs } from "@/components/project-tabs";

type State =
  | { status: "loading" }
  | { status: "ready"; project: ProjectDetail; members: MemberRow[]; activity: ActivityRow[] }
  | { status: "not-found"; message: string }
  | { status: "error"; message: string };

const STATUS_VALUES = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { user } = useSession();
  const { toast } = useToast();

  const [state, setState] = useState<State>({ status: "loading" });
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", status: "ACTIVE" as ProjectStatus, managerId: "" });
  const [directory, setDirectory] = useState<Pick<SafeUser, "id" | "name" | "email">[]>([]);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      projectsApi.get(projectId),
      projectsApi.members.list(projectId),
      projectsApi.activity(projectId, { limit: 5 }),
    ])
      .then(([projectRes, membersRes, activityRes]) =>
        setState({
          status: "ready",
          project: projectRes.data,
          members: membersRes.data,
          activity: activityRes.data,
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setState({ status: "not-found", message: error.message });
          return;
        }
        setState({ status: "error", message: errorMessage(error, "Could not load the project.") });
      });
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  useEffect(() => {
    if (!editOpen) return;
    usersApi
      .directory()
      .then((res) => setDirectory(res.data))
      .catch(() => setDirectory([]));
  }, [editOpen]);

  function openEdit(project: ProjectDetail) {
    setForm({
      name: project.name,
      description: project.description ?? "",
      status: project.status,
      managerId: project.manager?.id ?? "",
    });
    setSaveError(null);
    setEditOpen(true);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Parameters<typeof projectsApi.update>[1] = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      };
      if (user?.role === "ADMIN") body.managerId = form.managerId || null;
      await projectsApi.update(projectId, body);
      toast("Project updated.", "success");
      setEditOpen(false);
      load();
    } catch (error) {
      setSaveError(errorMessage(error, "Could not update the project."));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (saving || state.status !== "ready") return;
    const project = state.project;
    const nextStatus: ProjectStatus = project.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED";
    setSaving(true);
    try {
      await projectsApi.update(projectId, { status: nextStatus });
      toast(
        nextStatus === "ARCHIVED" ? "Project archived." : "Project restored to active.",
        "success",
      );
      setConfirmArchive(false);
      load();
    } catch (error) {
      toast(errorMessage(error, "Could not change the project status."), "error");
    } finally {
      setSaving(false);
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

  const { project, members, activity } = state;
  const canManage = project.permissions.canManage;
  const counts = project.taskCounts;
  const total = counts.total || 1;
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            All projects
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{project.name}</h1>
            <StatusBadge status={project.status} />
            {project.myRole ? <ProjectRoleBadge role={project.myRole} /> : null}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-ink-soft">
            {project.description || "No description provided."}
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            Manager: {project.manager?.name ?? "Unassigned"} · Updated{" "}
            {formatRelative(project.updatedAt)}
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => openEdit(project)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </Button>
            <Button
              variant={project.status === "ARCHIVED" ? "primary" : "danger"}
              onClick={() =>
                project.status === "ARCHIVED"
                  ? void handleArchiveToggle()
                  : setConfirmArchive(true)
              }
            >
              {project.status === "ARCHIVED" ? (
                <>
                  <ArchiveRestore className="h-4 w-4" aria-hidden />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" aria-hidden />
                  Archive
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <ProjectTabs projectId={projectId} active="overview" />

      {/* Task stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const).map((key) => {
          const label = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" }[key];
          const value = counts[key];
          const percent = Math.round((value / total) * 100);
          const color =
            key === "DONE" ? "bg-ok" : key === "BLOCKED" ? "bg-danger" : key === "IN_PROGRESS" ? "bg-info" : "bg-ink-faint";
          return (
            <Card key={key} className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
                <p className="text-xl font-bold text-ink">{value}</p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Team preview */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-ink-faint" aria-hidden />
              <h2 className="text-sm font-semibold text-ink">Team</h2>
            </div>
            <Link
              href={`/projects/${projectId}/team`}
              className="text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
            >
              Manage
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {members.slice(0, 5).map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={member.user.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {member.user.name}
                    {member.isOwner ? (
                      <span className="ml-1.5 text-[10px] font-bold uppercase text-brand-deep">Owner</span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-ink-faint">{member.user.email}</p>
                </div>
                <ProjectRoleBadge role={member.role} />
              </li>
            ))}
            {members.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-ink-faint">No members yet.</li>
            ) : null}
          </ul>
        </Card>

        {/* Activity preview */}
        <Card>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-ink-faint" aria-hidden />
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
            </div>
            <Link
              href={`/projects/${projectId}/activity`}
              className="text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {activity.map((row) => (
              <li key={row.id} className="px-5 py-3">
                <p className="text-sm text-ink">{row.summary}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{formatRelative(row.createdAt)}</p>
              </li>
            ))}
            {activity.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-ink-faint">
                No activity recorded yet.
              </li>
            ) : null}
          </ul>
        </Card>

        {/* Quick actions */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <Link href={`/projects/${projectId}/tasks`} className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <ListChecks className="h-4 w-4" aria-hidden />
                  Open task board
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/team`} className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <Users className="h-4 w-4" aria-hidden />
                  Team &amp; roles
                </Button>
              </Link>
              <Link href={`/projects/${projectId}/activity`} className="block">
                <Button variant="secondary" className="w-full justify-start">
                  <Activity className="h-4 w-4" aria-hidden />
                  Activity history
                </Button>
              </Link>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-ink-faint">
              <CalendarClock className="h-4 w-4" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide">Project</span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Status</dt>
                <dd className="font-medium text-ink">{PROJECT_STATUS_LABELS[project.status]}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Members</dt>
                <dd className="font-medium text-ink">{project.memberCount}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">Created</dt>
                <dd className="font-medium text-ink">{formatRelative(project.createdAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit project"
        description="Changes are recorded in the activity history."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!form.name.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {saveError ? <Alert>{saveError}</Alert> : null}
          <Field label="Project name" htmlFor="edit-name">
            <Input
              id="edit-name"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              maxLength={120}
            />
          </Field>
          <Field label="Description" htmlFor="edit-description">
            <Textarea
              id="edit-description"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              maxLength={2000}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status" htmlFor="edit-status">
              <Select
                id="edit-status"
                value={form.status}
                onChange={(event) => setForm((f) => ({ ...f, status: event.target.value as ProjectStatus }))}
              >
                {STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_STATUS_LABELS[value]}
                  </option>
                ))}
              </Select>
            </Field>
            {isAdmin ? (
              <Field label="Project manager" htmlFor="edit-manager" hint="Administrators only">
                <Select
                  id="edit-manager"
                  value={form.managerId}
                  onChange={(event) => setForm((f) => ({ ...f, managerId: event.target.value }))}
                >
                  <option value="">— Unassigned —</option>
                  {directory.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({person.email})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Archive confirmation */}
      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="Archive this project?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleArchiveToggle()} loading={saving}>
              Archive project
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Archiving hides the project from active lists and notifies the team. You can restore it at
          any time.
        </p>
      </Modal>
    </div>
  );
}
