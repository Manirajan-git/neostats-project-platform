import type {
  Project,
  ProjectRole,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";
import type { SafeUser } from "../types/dto";
import { prisma } from "../lib/prisma";
import { recordActivity, notifyUsers } from "../lib/journal";
import {
  assertCanManage,
  loadProjectAccess,
  requireSystemRole,
} from "../lib/permissions";
import { SAFE_USER_SELECT } from "../utils/userMapper";
import { AppError } from "../utils/errors";
import type { PaginationMeta } from "../types/dto";
import type {
  AddMemberInput,
  CreateProjectInput,
  ProjectListQuery,
  UpdateMemberInput,
  UpdateProjectInput,
} from "../schemas/project.schema";

export interface TaskCounts extends Record<TaskStatus, number> {
  total: number;
}

function emptyCounts(): TaskCounts {
  return { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, total: 0 };
}

function tally(statuses: { status: TaskStatus }[]): TaskCounts {
  const counts = emptyCounts();
  for (const row of statuses) counts[row.status] += 1;
  counts.total = statuses.length;
  return counts;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  manager: SafeUser | null;
  memberCount: number;
  taskCounts: TaskCounts;
  myRole: ProjectRole | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPermissions {
  canManage: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
}

export interface ProjectDetail extends ProjectSummary {
  permissions: ProjectPermissions;
}

export interface MemberRow {
  id: string;
  role: ProjectRole;
  isOwner: boolean;
  createdAt: Date;
  user: SafeUser;
}

const projectInclude = {
  manager: { select: SAFE_USER_SELECT },
  members: { select: { role: true, userId: true } },
  tasks: { select: { status: true } },
} as const;

type ProjectWithExtras = Project & {
  manager: SafeUser | null;
  members: { role: ProjectRole; userId: string }[];
  tasks: { status: TaskStatus }[];
};

function toSummary(project: ProjectWithExtras, viewerId: string, viewerRole: SafeUser["role"]): ProjectSummary {
  const membership = project.members.find((m) => m.userId === viewerId) ?? null;
  let myRole: ProjectRole | null;
  if (viewerRole === "ADMIN") myRole = "MANAGER";
  else if (project.managerId && project.managerId === viewerId) myRole = "MANAGER";
  else myRole = membership?.role ?? null;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    manager: project.manager,
    memberCount: project.members.length,
    taskCounts: tally(project.tasks),
    myRole,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/** Projects the user can see: admins see everything, others see owned + member projects. */
export async function listProjects(user: SafeUser, query: ProjectListQuery) {
  const visibility =
    user.role === "ADMIN"
      ? {}
      : {
          OR: [
            { managerId: user.id },
            { members: { some: { userId: user.id } } },
          ],
        };

  const filters = [
    visibility,
    query.status ? { status: query.status } : {},
    query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {},
  ].filter((clause) => Object.keys(clause).length > 0);

  const where = filters.length > 0 ? { AND: filters } : undefined;
  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      include: projectInclude,
      orderBy: { updatedAt: "desc" },
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
  return {
    data: projects.map((p) => toSummary(p, user.id, user.role)),
    meta,
  };
}

export async function createProject(user: SafeUser, input: CreateProjectInput): Promise<ProjectDetail> {
  requireSystemRole(user, "ADMIN");

  const managerId = input.managerId ?? user.id;
  if (managerId !== user.id) {
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { isActive: true },
    });
    if (!manager || !manager.isActive) {
      throw new AppError(400, "INVALID_MANAGER", "The selected manager is inactive or does not exist.");
    }
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        name: input.name,
        description: input.description,
        status: input.status ?? "ACTIVE",
        managerId,
      },
      include: projectInclude,
    });
    const memberIds = [...new Set([user.id, managerId])];
    await tx.projectMember.createMany({
      data: memberIds.map((userId) => ({
        projectId: created.id,
        userId,
        role: "MANAGER" as ProjectRole,
      })),
      skipDuplicates: true,
    });
    await recordActivity(tx, {
      actorId: user.id,
      projectId: created.id,
      action: "project.created",
      entityType: "PROJECT",
      entityId: created.id,
      summary: `${user.name} created project "${created.name}"`,
    });
    return created;
  });

  const detail = await getProject(user, project.id);
  return detail;
}

export async function getProject(user: SafeUser, projectId: string): Promise<ProjectDetail> {
  const access = await loadProjectAccess(user, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: projectInclude,
  });
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  return {
    ...toSummary(project, user.id, user.role),
    permissions: {
      canManage: access.canManage,
      canChangeStatus: access.canChangeStatus,
      canComment: access.canComment,
    },
  };
}

export async function updateProject(
  user: SafeUser,
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectDetail> {
  const access = await loadProjectAccess(user, projectId);
  assertCanManage(access);

  if (input.managerId !== undefined && user.role !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Only administrators can reassign the project manager.");
  }
  if (input.managerId) {
    const manager = await prisma.user.findUnique({
      where: { id: input.managerId },
      select: { isActive: true },
    });
    if (!manager || !manager.isActive) {
      throw new AppError(400, "INVALID_MANAGER", "The selected manager is inactive or does not exist.");
    }
  }

  const wasArchived = access.project.status === "ARCHIVED";
  const willArchive = input.status === "ARCHIVED" && !wasArchived;

  const project = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
      },
      include: projectInclude,
    });

    if (updated.managerId) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: updated.managerId } },
        create: { projectId, userId: updated.managerId, role: "MANAGER" },
        update: { role: "MANAGER" },
      });
    }

    const action = willArchive ? "project.archived" : "project.updated";
    const summary = willArchive
      ? `${user.name} archived project "${updated.name}"`
      : `${user.name} updated project "${updated.name}"`;
    await recordActivity(tx, {
      actorId: user.id,
      projectId,
      action,
      entityType: "PROJECT",
      entityId: projectId,
      summary,
      metadata: { fields: Object.keys(input).filter((k) => k !== "managerId") },
    });

    if (willArchive) {
      const members = await tx.projectMember.findMany({
        where: { projectId },
        select: { userId: true },
      });
      await notifyUsers(tx, user.id, members.map((m) => m.userId), {
        type: "PROJECT_ARCHIVED",
        message: `Project "${updated.name}" was archived`,
        entityType: "PROJECT",
        entityId: projectId,
        projectId,
      });
    }
    return updated;
  });

  return {
    ...toSummary(project, user.id, user.role),
    permissions: {
      canManage: access.canManage,
      canChangeStatus: access.canChangeStatus,
      canComment: access.canComment,
    },
  };
}

export async function listMembers(user: SafeUser, projectId: string): Promise<MemberRow[]> {
  const access = await loadProjectAccess(user, projectId);
  void access;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: { user: { select: SAFE_USER_SELECT } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");

  const rows: MemberRow[] = project.members.map((m) => ({
    id: m.id,
    role: m.role,
    isOwner: project.managerId === m.userId,
    createdAt: m.createdAt,
    user: m.user,
  }));

  // The owner always appears, even if they somehow lack an explicit membership row.
  if (project.managerId && !rows.some((r) => r.user.id === project.managerId)) {
    const owner = await prisma.user.findUnique({
      where: { id: project.managerId },
      select: SAFE_USER_SELECT,
    });
    if (owner) {
      rows.unshift({
        id: `owner-${owner.id}`,
        role: "MANAGER",
        isOwner: true,
        createdAt: project.createdAt,
        user: owner,
      });
    }
  }
  return rows;
}

export async function addMember(
  user: SafeUser,
  projectId: string,
  input: AddMemberInput,
): Promise<MemberRow> {
  const access = await loadProjectAccess(user, projectId);
  assertCanManage(access);

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    select: SAFE_USER_SELECT,
  });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (!target.isActive) {
    throw new AppError(400, "USER_INACTIVE", "Deactivated users cannot join projects.");
  }

  const existing = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: input.userId } },
  });
  if (existing) {
    throw new AppError(409, "DUPLICATE", "This user is already a member of the project.");
  }

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.projectMember.create({
      data: { projectId, userId: input.userId, role: input.role },
      include: { user: { select: SAFE_USER_SELECT } },
    });
    await recordActivity(tx, {
      actorId: user.id,
      projectId,
      action: "member.added",
      entityType: "PROJECT_MEMBER",
      entityId: created.id,
      summary: `${user.name} added ${target.name} to the project`,
      metadata: { role: input.role },
    });
    await notifyUsers(tx, user.id, [input.userId], {
      type: "MEMBER_ADDED",
      message: `You were added to project "${access.project.name}"`,
      entityType: "PROJECT",
      entityId: projectId,
      projectId,
    });
    return created;
  });

  return {
    id: member.id,
    role: member.role,
    isOwner: access.project.managerId === member.userId,
    createdAt: member.createdAt,
    user: member.user,
  };
}

export async function updateMemberRole(
  user: SafeUser,
  projectId: string,
  memberId: string,
  input: UpdateMemberInput,
): Promise<MemberRow> {
  const access = await loadProjectAccess(user, projectId);
  assertCanManage(access);

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: { user: { select: SAFE_USER_SELECT } },
  });
  if (!member || member.projectId !== projectId) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Project member not found.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.projectMember.update({
      where: { id: memberId },
      data: { role: input.role },
      include: { user: { select: SAFE_USER_SELECT } },
    });
    await recordActivity(tx, {
      actorId: user.id,
      projectId,
      action: "member.role_changed",
      entityType: "PROJECT_MEMBER",
      entityId: memberId,
      summary: `${user.name} set ${row.user.name}'s project role to ${input.role}`,
      metadata: { role: input.role },
    });
    await notifyUsers(tx, user.id, [row.userId], {
      type: "MEMBER_ROLE_CHANGED",
      message: `Your role in project "${access.project.name}" is now ${input.role}`,
      entityType: "PROJECT",
      entityId: projectId,
      projectId,
    });
    return row;
  });

  return {
    id: updated.id,
    role: updated.role,
    isOwner: access.project.managerId === updated.userId,
    createdAt: updated.createdAt,
    user: updated.user,
  };
}

export async function removeMember(
  user: SafeUser,
  projectId: string,
  memberId: string,
): Promise<{ success: true }> {
  const access = await loadProjectAccess(user, projectId);
  assertCanManage(access);

  const member = await prisma.projectMember.findUnique({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!member || member.projectId !== projectId) {
    throw new AppError(404, "MEMBER_NOT_FOUND", "Project member not found.");
  }
  if (access.project.managerId === member.userId) {
    throw new AppError(
      400,
      "OWNER_CANNOT_BE_REMOVED",
      "Reassign the project manager before removing this member.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { id: memberId } });
    await recordActivity(tx, {
      actorId: user.id,
      projectId,
      action: "member.removed",
      entityType: "PROJECT_MEMBER",
      entityId: memberId,
      summary: `${user.name} removed ${member.user.name} from the project`,
    });
    await notifyUsers(tx, user.id, [member.userId], {
      type: "MEMBER_REMOVED",
      message: `You were removed from project "${access.project.name}"`,
      entityType: "PROJECT",
      entityId: projectId,
      projectId,
    });
  });

  return { success: true };
}
