"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { projectsApi, usersApi } from "@/lib/api";
import {
  PROJECT_ROLE_LABELS,
  type MemberRow,
  type ProjectDetail,
  type ProjectRole,
  type SafeUser,
} from "@/lib/types";
import { errorMessage, formatRelative } from "@/lib/format";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Modal,
  PageLoader,
  ProjectRoleBadge,
  Select,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/shell/session";
import { ProjectTabs } from "@/components/project-tabs";

type State =
  | { status: "loading" }
  | { status: "ready"; project: ProjectDetail; members: MemberRow[] }
  | { status: "error"; message: string };

const ROLE_VALUES = Object.keys(PROJECT_ROLE_LABELS) as ProjectRole[];

export default function ProjectTeamPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const { user } = useSession();
  const { toast } = useToast();

  const [state, setState] = useState<State>({ status: "loading" });
  const [directory, setDirectory] = useState<Pick<SafeUser, "id" | "name" | "email">[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({ userId: "", role: "MEMBER" as ProjectRole });

  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(() => {
    Promise.all([projectsApi.get(projectId), projectsApi.members.list(projectId)])
      .then(([projectRes, membersRes]) =>
        setState({ status: "ready", project: projectRes.data, members: membersRes.data }),
      )
      .catch((error: unknown) =>
        setState({ status: "error", message: errorMessage(error, "Could not load the team.") }),
      );
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  const canManage = state.status === "ready" && state.project.permissions.canManage;

  useEffect(() => {
    if (!addOpen) return;
    usersApi
      .directory()
      .then((res) => setDirectory(res.data))
      .catch(() => setDirectory([]));
  }, [addOpen]);

  async function handleAdd() {
    if (adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await projectsApi.members.add(projectId, { userId: addForm.userId, role: addForm.role });
      toast("Member added.", "success");
      setAddOpen(false);
      setAddForm({ userId: "", role: "MEMBER" });
      load();
    } catch (error) {
      setAddError(errorMessage(error, "Could not add the member."));
    } finally {
      setAdding(false);
    }
  }

  async function handleChangeRole(member: MemberRow, role: ProjectRole) {
    if (busyId) return;
    setBusyId(member.id);
    try {
      await projectsApi.members.updateRole(projectId, member.id, role);
      toast(`${member.user.name} is now a ${PROJECT_ROLE_LABELS[role].toLowerCase()}.`, "success");
      load();
    } catch (error) {
      toast(errorMessage(error, "Could not update the role."), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      await projectsApi.members.remove(projectId, removeTarget.id);
      toast(`${removeTarget.user.name} removed from the project.`, "success");
      setRemoveTarget(null);
      load();
    } catch (error) {
      toast(errorMessage(error, "Could not remove the member."), "error");
    } finally {
      setRemoving(false);
    }
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

  const { project, members } = state;
  const existingIds = new Set(members.map((m) => m.user.id));
  const isAdmin = user?.role === "ADMIN";
  const addable = directory.filter((person) => !existingIds.has(person.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Project overview
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Team &amp; roles</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {project.name} · {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Add member
          </Button>
        ) : null}
      </div>

      <ProjectTabs projectId={projectId} active="team" />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Members</h2>
          <span className="text-xs text-ink-faint">Project roles control task &amp; team rights</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2.5 font-semibold">Member</th>
                <th className="px-5 py-2.5 font-semibold">Project role</th>
                <th className="px-5 py-2.5 font-semibold">Joined</th>
                {canManage ? <th className="px-5 py-2.5 text-right font-semibold">Actions</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.user.name} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {member.user.name}
                          {member.isOwner ? (
                            <span className="ml-2 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-deep">
                              Project manager
                            </span>
                          ) : null}
                          {member.user.id === user?.id ? (
                            <span className="ml-2 text-[10px] font-semibold uppercase text-ink-faint">
                              You
                            </span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-ink-faint">{member.user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {canManage && !member.isOwner ? (
                      <Select
                        value={member.role}
                        disabled={busyId === member.id}
                        aria-label={`Role for ${member.user.name}`}
                        className="w-36"
                        onChange={(event) => void handleChangeRole(member, event.target.value as ProjectRole)}
                      >
                        {ROLE_VALUES.map((role) => (
                          <option key={role} value={role}>
                            {PROJECT_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <ProjectRoleBadge role={member.role} />
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-faint">
                    {formatRelative(member.createdAt)}
                  </td>
                  {canManage ? (
                    <td className="px-5 py-3 text-right">
                      {member.isOwner ? (
                        <span className="text-xs text-ink-faint">Cannot remove the owner</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${member.user.name}`}
                          onClick={() => setRemoveTarget(member)}
                        >
                          <Trash2 className="h-4 w-4 text-danger" aria-hidden />
                        </Button>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {isAdmin ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Project manager</h2>
          <p className="mt-1 text-xs text-ink-faint">
            The project manager owns day-to-day decisions on tasks and team membership. Only
            administrators can reassign this.
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            {project.manager ? (
              <div className="flex items-center gap-2">
                <Avatar name={project.manager.name} size="sm" />
                <div>
                  <p className="text-sm font-medium text-ink">{project.manager.name}</p>
                  <p className="text-xs text-ink-faint">{project.manager.email}</p>
                </div>
              </div>
            ) : (
              <span className="text-sm text-ink-faint">No manager assigned</span>
            )}
          </div>
          <div className="mt-3 max-w-sm">
            <Field label="Reassign manager" htmlFor="manager-select" hint="Administrators only">
              <Select
                id="manager-select"
                defaultValue={project.manager?.id ?? ""}
                onChange={async (event) => {
                  try {
                    await projectsApi.update(projectId, { managerId: event.target.value || null });
                    toast("Project manager updated.", "success");
                    load();
                  } catch (error) {
                    toast(errorMessage(error, "Could not update the manager."), "error");
                  }
                }}
              >
                <option value="">— Unassigned —</option>
                {directory.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.email})
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      ) : null}

      {/* Add member modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add member"
        description="Members can be assigned tasks and receive notifications."
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleAdd()}
              loading={adding}
              disabled={!addForm.userId}
            >
              Add member
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {addError ? <Alert>{addError}</Alert> : null}
          {addable.length === 0 ? (
            <Alert tone="info">
              Everyone in the directory is already on this project.
            </Alert>
          ) : (
            <>
              <Field label="User" htmlFor="member-user">
                <Select
                  id="member-user"
                  value={addForm.userId}
                  onChange={(event) => setAddForm((f) => ({ ...f, userId: event.target.value }))}
                >
                  <option value="">Select a user…</option>
                  {addable.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} ({person.email})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Project role"
                htmlFor="member-role"
                hint="Viewer is read-only; Manager can edit tasks and manage the team."
              >
                <Select
                  id="member-role"
                  value={addForm.role}
                  onChange={(event) => setAddForm((f) => ({ ...f, role: event.target.value as ProjectRole }))}
                >
                  {ROLE_VALUES.map((role) => (
                    <option key={role} value={role}>
                      {PROJECT_ROLE_LABELS[role]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}
        </div>
      </Modal>

      {/* Remove confirmation */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove member?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void handleRemove()} loading={removing}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {removeTarget ? `${removeTarget.user.name} will lose access to this project.` : ""}
          Their existing tasks stay in place.
        </p>
      </Modal>
    </div>
  );
}
