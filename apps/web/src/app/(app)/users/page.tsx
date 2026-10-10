"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, UserRoundX } from "lucide-react";
import { usersApi } from "@/lib/api";
import { ROLE_LABELS, type SafeUser, type SystemRole } from "@/lib/types";
import { errorMessage, formatRelative } from "@/lib/format";
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
  Pagination,
  Select,
  SystemRoleBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/shell/session";

type State =
  | { status: "loading" }
  | { status: "ready"; users: SafeUser[]; meta: { page: number; totalPages: number; total: number } }
  | { status: "error"; message: string };

const ROLE_VALUES = Object.keys(ROLE_LABELS) as SystemRole[];

export default function UsersPage() {
  const { user: me } = useSession();
  const { toast } = useToast();

  const [state, setState] = useState<State>({ status: "loading" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "TEAM_MEMBER" as SystemRole,
  });

  const [editTarget, setEditTarget] = useState<SafeUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "TEAM_MEMBER" as SystemRole, password: "" });

  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    usersApi
      .list({ page, limit: 20, q: search || undefined })
      .then(({ data, meta }) =>
        setState({ status: "ready", users: data, meta: { page: meta.page, totalPages: meta.totalPages, total: meta.total } }),
      )
      .catch((error: unknown) =>
        setState({ status: "error", message: errorMessage(error, "Could not load users.") }),
      );
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  function retry() {
    setState({ status: "loading" });
    load();
  }

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function handleCreate() {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      await usersApi.create({
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role,
      });
      toast("User created.", "success");
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "TEAM_MEMBER" });
      load();
    } catch (error) {
      setFormError(errorMessage(error, "Could not create the user."));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user: SafeUser) {
    setEditTarget(user);
    setEditForm({ name: user.name, email: user.email, role: user.role, password: "" });
    setFormError(null);
  }

  async function handleSaveEdit() {
    if (!editTarget || saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const body: { name: string; email: string; role: SystemRole; password?: string } = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
      };
      if (editForm.password) body.password = editForm.password;
      await usersApi.update(editTarget.id, body);
      toast("User updated.", "success");
      setEditTarget(null);
      load();
    } catch (error) {
      setFormError(errorMessage(error, "Could not update the user."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: SafeUser) {
    if (busyId) return;
    setBusyId(user.id);
    try {
      await usersApi.setActive(user.id, user.isActive ? "deactivate" : "activate");
      toast(user.isActive ? `${user.name} deactivated.` : `${user.name} activated.`, "success");
      load();
    } catch (error) {
      toast(errorMessage(error, "Could not change the account status."), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">User management</h1>
          <p className="mt-1 text-sm text-ink-faint">
            {state.status === "ready" ? `${state.meta.total} accounts` : "Manage system roles and access."}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New user
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <Input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search name or email…"
          aria-label="Search users"
          className="pl-9"
        />
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

      {state.status === "ready" && state.users.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" aria-hidden />}
          title={search ? "No users match your search" : "No users found"}
          hint="Create an account to get started."
        />
      ) : null}

      {state.status === "ready" && state.users.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-2.5 font-semibold">User</th>
                  <th className="px-5 py-2.5 font-semibold">System role</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 font-semibold">Joined</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {state.users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={user.name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {user.name}
                            {user.id === me?.id ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-ink-faint">
                                You
                              </span>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-ink-faint">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <SystemRoleBadge role={user.role} />
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={user.isActive ? "ok" : "danger"}>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-ink-faint">{formatRelative(user.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Edit
                        </Button>
                        <Button
                          variant={user.isActive ? "ghost" : "secondary"}
                          size="sm"
                          disabled={user.id === me?.id || busyId === user.id}
                          title={user.id === me?.id ? "You cannot deactivate your own account" : undefined}
                          onClick={() => void toggleActive(user)}
                        >
                          <UserRoundX className="h-3.5 w-3.5" aria-hidden />
                          {user.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={state.meta.page}
            totalPages={state.meta.totalPages}
            total={state.meta.total}
            onChange={setPage}
          />
        </Card>
      ) : null}

      {/* Create user */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New user"
        description="Accounts can sign in immediately after creation."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleCreate()}
              loading={saving}
              disabled={!createForm.name.trim() || !createForm.email.trim() || createForm.password.length < 8}
            >
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field label="Full name" htmlFor="new-name" error={null}>
            <Input
              id="new-name"
              value={createForm.name}
              onChange={(event) => setCreateForm((f) => ({ ...f, name: event.target.value }))}
              maxLength={80}
              autoFocus
            />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <Input
              id="new-email"
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm((f) => ({ ...f, email: event.target.value }))}
              maxLength={160}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="new-password"
            hint="Minimum 8 characters"
            error={null}
          >
            <Input
              id="new-password"
              type="password"
              value={createForm.password}
              onChange={(event) => setCreateForm((f) => ({ ...f, password: event.target.value }))}
              autoComplete="new-password"
            />
          </Field>
          <Field label="System role" htmlFor="new-role" hint="Administrators can manage users and projects.">
            <Select
              id="new-role"
              value={createForm.role}
              onChange={(event) => setCreateForm((f) => ({ ...f, role: event.target.value as SystemRole }))}
            >
              {ROLE_VALUES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Edit user */}
      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `Edit ${editTarget.name}` : "Edit user"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSaveEdit()}
              loading={saving}
              disabled={!editForm.name.trim() || !editForm.email.trim()}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field label="Full name" htmlFor="edit-user-name" error={null}>
            <Input
              id="edit-user-name"
              value={editForm.name}
              onChange={(event) => setEditForm((f) => ({ ...f, name: event.target.value }))}
              maxLength={80}
            />
          </Field>
          <Field label="Email" htmlFor="edit-user-email">
            <Input
              id="edit-user-email"
              type="email"
              value={editForm.email}
              onChange={(event) => setEditForm((f) => ({ ...f, email: event.target.value }))}
              maxLength={160}
            />
          </Field>
          <Field
            label="New password"
            htmlFor="edit-user-password"
            hint="Leave blank to keep the current password"
          >
            <Input
              id="edit-user-password"
              type="password"
              value={editForm.password}
              onChange={(event) => setEditForm((f) => ({ ...f, password: event.target.value }))}
              autoComplete="new-password"
            />
          </Field>
          <Field label="System role" htmlFor="edit-user-role">
            <Select
              id="edit-user-role"
              value={editForm.role}
              disabled={editTarget?.id === me?.id}
              onChange={(event) => setEditForm((f) => ({ ...f, role: event.target.value as SystemRole }))}
            >
              {ROLE_VALUES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            {editTarget?.id === me?.id ? (
              <p className="mt-1 text-xs text-ink-faint">You cannot change your own role.</p>
            ) : null}
          </Field>
        </div>
      </Modal>
    </div>
  );
}
