"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { authApi } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/types";
import { errorMessage, formatDateTime } from "@/lib/format";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Input,
  PageLoader,
  SystemRoleBadge,
} from "@/components/ui";
import { useToast } from "@/components/toast";
import { useSession } from "@/components/shell/session";

export default function ProfilePage() {
  const { user, state, refresh } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  // `null` means "use the session value"; typing sets it, saving resets it.
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "loading" || !user) return <PageLoader />;

  const nameValue = name ?? user.name;

  async function handleSave() {
    const next = nameValue.trim();
    if (saving || !next) return;
    setSaving(true);
    setError(null);
    try {
      await authApi.updateProfile(next);
      await refresh();
      setName(null);
      toast("Profile updated.", "success");
    } catch (err) {
      setError(errorMessage(err, "Could not update your profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Your profile</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Account details for this workspace. Email and roles are managed by administrators.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Display name</h2>
          <p className="mt-1 text-xs text-ink-faint">
            Your name appears in activity history, comments and team lists.
          </p>
          <div className="mt-4 max-w-md space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Full name" htmlFor="profile-name" error={null}>
              <Input
                id="profile-name"
                value={nameValue}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            </Field>
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              loading={saving}
              disabled={!nameValue.trim() || nameValue.trim() === user.name}
            >
              Save changes
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-ink-faint">{user.email}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-faint">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Role
                </dt>
                <dd>
                  <SystemRoleBadge role={user.role} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-faint">
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  Email
                </dt>
                <dd className="max-w-40 truncate font-medium text-ink" title={user.email}>
                  {user.email}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-faint">
                  <UserRound className="h-3.5 w-3.5" aria-hidden />
                  Status
                </dt>
                <dd className="font-medium text-ink">{user.isActive ? "Active" : "Inactive"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-ink-faint">
                  <KeyRound className="h-3.5 w-3.5" aria-hidden />
                  Member since
                </dt>
                <dd className="font-medium text-ink">{formatDateTime(user.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-ink">Access</h3>
            <p className="mt-1 text-xs text-ink-faint">
              {ROLE_LABELS[user.role]} — your system role determines what you can do across all
              projects. Contact an administrator to change it.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
