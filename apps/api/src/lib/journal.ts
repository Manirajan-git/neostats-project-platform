import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export interface ActivityInput {
  actorId?: string | null;
  projectId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Prisma.InputJsonValue;
}

/** Appends one activity record. Call inside the same transaction as the mutation when possible. */
export async function recordActivity(db: Db, input: ActivityInput): Promise<void> {
  await db.activityLog.create({
    data: {
      actorId: input.actorId ?? null,
      projectId: input.projectId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

export interface NotificationInput {
  userId: string;
  type: string;
  message: string;
  entityType?: string;
  entityId?: string;
  projectId?: string;
}

/** Creates notifications for the given recipients, skipping the actor and empties. */
export async function notifyUsers(
  db: Db,
  actorId: string | null,
  recipients: (string | null | undefined)[],
  input: Omit<NotificationInput, "userId">,
): Promise<void> {
  const unique = [
    ...new Set(recipients.filter((id): id is string => Boolean(id) && id !== actorId)),
  ];
  if (unique.length === 0) return;
  await db.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
}
