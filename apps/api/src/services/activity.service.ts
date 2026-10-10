import { prisma } from "../lib/prisma";
import { loadProjectAccess } from "../lib/permissions";
import type { SafeUser, PaginationMeta } from "../types/dto";
import { AppError } from "../utils/errors";
import type { Prisma } from "@prisma/client";

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  projectId: string | null;
  projectName?: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
}

const activityInclude = {
  actor: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const;

type ActivityWithActor = Prisma.ActivityLogGetPayload<{ include: typeof activityInclude }>;

function toRow(row: ActivityWithActor): ActivityRow {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    metadata: row.metadata,
    createdAt: row.createdAt,
    actor: row.actor,
  };
}

export async function listProjectActivity(
  user: SafeUser,
  projectId: string,
  query: { page: number; limit: number },
) {
  const access = await loadProjectAccess(user, projectId);
  void access;

  const where = { projectId };
  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: activityInclude,
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
  return { data: rows.map(toRow), meta };
}

/** Platform-wide feed - administrators only (route enforces the role). */
export async function listPlatformActivity(
  user: SafeUser,
  query: { page: number; limit: number },
) {
  if (user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only administrators can view platform activity.");
  }

  const where: Prisma.ActivityLogWhereInput = {};
  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: activityInclude,
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
  return { data: rows.map(toRow), meta };
}
