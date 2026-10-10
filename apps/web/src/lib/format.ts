/** Shared formatting helpers (dates, initials, overdue checks). */

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (minutes < 1) return "just now";
  if (minutes < 60) return rtf.format(Math.round(diffMs / 60000), "minute");
  const hours = Math.round(abs / 3600000);
  if (hours < 24) return rtf.format(Math.round(diffMs / 3600000), "hour");
  const days = Math.round(abs / 86400000);
  if (days < 30) return rtf.format(Math.round(diffMs / 86400000), "day");
  return formatDate(date);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isOverdue(dueDate: string | null | undefined, status?: string): boolean {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function dueSoon(dueDate: string | null | undefined, status?: string): boolean {
  if (!dueDate || status === "DONE" || isOverdue(dueDate)) return false;
  return new Date(dueDate).getTime() <= Date.now() + 7 * 24 * 60 * 60 * 1000;
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
