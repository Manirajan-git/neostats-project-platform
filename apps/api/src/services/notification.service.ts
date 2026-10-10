import { prisma } from "../lib/prisma";
import type { SafeUser, PaginationMeta } from "../types/dto";
import { AppError } from "../utils/errors";

export interface NotificationRow {
  id: string;
  type: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  read: boolean;
  createdAt: Date;
}

export async function listNotifications(
  user: SafeUser,
  query: { page: number; limit: number; unreadOnly?: boolean },
) {
  const where = {
    userId: user.id,
    ...(query.unreadOnly ? { read: false } : {}),
  };
  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  const meta: PaginationMeta = {
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
  return { data: rows, meta, unreadCount: unread };
}

export async function unreadCount(user: SafeUser): Promise<number> {
  return prisma.notification.count({ where: { userId: user.id, read: false } });
}

export async function markRead(user: SafeUser, id: string): Promise<NotificationRow> {
  const existing = await prisma.notification.findUnique({ where: { id } });
  // Own-resource check first: never confirm existence of other users' records.
  if (!existing || existing.userId !== user.id) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
  }
  if (existing.read) return existing;
  return prisma.notification.update({ where: { id }, data: { read: true } });
}

export async function markAllRead(user: SafeUser): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  return { updated: result.count };
}
