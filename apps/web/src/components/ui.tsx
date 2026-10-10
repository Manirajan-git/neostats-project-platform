"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Loader2, X, ChevronLeft, ChevronRight } from "lucide-react";
import {
  PROJECT_ROLE_LABELS,
  PROJECT_STATUS_LABELS,
  ROLE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type ProjectRole,
  type ProjectStatus,
  type SystemRole,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { initials } from "@/lib/format";

/* ------------------------------- Button ------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-deep hover:bg-brand-strong focus-visible:outline-brand border border-transparent shadow-sm",
  secondary:
    "bg-surface text-ink hover:bg-surface-2 border border-line-strong shadow-sm",
  ghost: "bg-transparent text-ink-soft hover:bg-line/60 hover:text-ink border border-transparent",
  danger: "bg-danger text-white hover:bg-danger/90 border border-transparent shadow-sm",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9.5 px-3.5 text-sm gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  type = "button",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-55 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ------------------------------ Form fields ---------------------------- */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const FIELD_CONTROL =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint shadow-sm transition-colors focus:border-brand-strong focus:outline-2 focus:outline-brand/40 disabled:bg-surface-2 disabled:text-ink-faint";

export function Input({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-9.5 ${FIELD_CONTROL} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`min-h-24 py-2 ${FIELD_CONTROL} ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`h-9.5 pr-8 ${FIELD_CONTROL} ${className}`} {...rest}>
      {children}
    </select>
  );
}

/* -------------------------------- Card --------------------------------- */

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}>{children}</div>
  );
}

/* -------------------------------- Badge -------------------------------- */

const TONES = {
  neutral: "bg-line/70 text-ink-soft border-line-strong",
  brand: "bg-brand-soft text-brand-deep border-brand/50",
  info: "bg-info-soft text-info border-info/30",
  warn: "bg-warn-soft text-warn border-warn/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  ok: "bg-ok-soft text-ok border-ok/30",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<ProjectStatus | TaskStatus, BadgeTone> = {
  ACTIVE: "ok",
  ON_HOLD: "warn",
  COMPLETED: "info",
  ARCHIVED: "neutral",
  TODO: "neutral",
  IN_PROGRESS: "info",
  BLOCKED: "danger",
  DONE: "ok",
};

export function StatusBadge({ status }: { status: ProjectStatus | TaskStatus }) {
  const label =
    status in TASK_STATUS_LABELS
      ? TASK_STATUS_LABELS[status as TaskStatus]
      : PROJECT_STATUS_LABELS[status as ProjectStatus];
  return <Badge tone={STATUS_TONES[status]}>{label}</Badge>;
}

const PRIORITY_TONES: Record<TaskPriority, BadgeTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warn",
  URGENT: "danger",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={PRIORITY_TONES[priority]}>{TASK_PRIORITY_LABELS[priority]}</Badge>;
}

export function ProjectRoleBadge({ role }: { role: ProjectRole }) {
  const tone: BadgeTone = role === "MANAGER" ? "brand" : role === "VIEWER" ? "neutral" : "info";
  return <Badge tone={tone}>{PROJECT_ROLE_LABELS[role]}</Badge>;
}

export function SystemRoleBadge({ role }: { role: SystemRole }) {
  const tone: BadgeTone =
    role === "ADMIN" ? "brand" : role === "PROJECT_MANAGER" ? "info" : role === "VIEWER" ? "neutral" : "ok";
  return <Badge tone={tone}>{ROLE_LABELS[role]}</Badge>;
}

/* ------------------------------- Spinner -------------------------------- */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-ink-faint" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/* ------------------------------ Empty state ----------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center">
      {icon ? <span className="text-ink-faint">{icon}</span> : null}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="max-w-md text-xs text-ink-faint">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------- Alert --------------------------------- */

export function Alert({
  tone = "danger",
  children,
  className = "",
}: {
  tone?: "danger" | "success" | "info" | "warn";
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    danger: "border-danger/30 bg-danger-soft text-danger",
    success: "border-ok/30 bg-ok-soft text-ok",
    info: "border-info/30 bg-info-soft text-info",
    warn: "border-warn/30 bg-warn-soft text-warn",
  }[tone];
  return (
    <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${styles} ${className}`}>
      {children}
    </div>
  );
}

/* -------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const width = size === "lg" ? "max-w-2xl" : size === "sm" ? "max-w-sm" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-shell/45"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-fade-in relative z-10 w-full ${width} rounded-xl border border-line bg-surface shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-ink-faint">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-line/70 hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Modal>
  );
}

/* ------------------------------ Pagination ------------------------------ */

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-faint">
      <span>
        Page {page} of {Math.max(totalPages, 1)} · {total} total
      </span>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------- Avatar -------------------------------- */

const AVATAR_TONES = [
  "bg-brand-soft text-brand-deep",
  "bg-info-soft text-info",
  "bg-warn-soft text-warn",
  "bg-ok-soft text-ok",
  "bg-danger-soft text-danger",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const code = initials(name);
  let hash = 0;
  for (const ch of name) hash = (hash + ch.charCodeAt(0)) % AVATAR_TONES.length;
  const dims = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dims} ${AVATAR_TONES[hash]}`}
    >
      {code}
    </span>
  );
}
