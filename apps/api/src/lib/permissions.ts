import type { Project, ProjectMember, ProjectRole, SystemRole } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "./prisma";
import { AppError } from "../utils/errors";
import type { SafeUser } from "../types/dto";

/** Narrow `req.user` for handlers mounted behind `authenticate`. */
export function requireUser(req: Request): SafeUser {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  return req.user;
}

/**
 * Effective project-level role for a user:
 * - ADMIN is treated as MANAGER everywhere.
 * - The assigned project manager (owner) is MANAGER even without a membership row.
 * - Otherwise the explicit membership decides; `null` means no access at all.
 */
export function effectiveProjectRole(
  user: Pick<SafeUser, "id" | "role">,
  project: Pick<Project, "managerId">,
  membership: Pick<ProjectMember, "role"> | null | undefined,
): ProjectRole | null {
  if (user.role === "ADMIN") return "MANAGER";
  if (project.managerId && project.managerId === user.id) return "MANAGER";
  return membership?.role ?? null;
}

export interface ProjectAccess {
  project: Project;
  membership: ProjectMember | null;
  /** Effective project role (null => no access). */
  role: ProjectRole | null;
  canView: boolean;
  /** Update project, manage members, create/edit/delete tasks, reassign. */
  canManage: boolean;
  /** Change task status (managers or regular members; never viewers). */
  canChangeStatus: boolean;
  /** Add comments (never viewers). */
  canComment: boolean;
}

export function resolveProjectAccess(
  user: SafeUser,
  project: Project,
  membership: ProjectMember | null,
): ProjectAccess {
  const role = effectiveProjectRole(user, project, membership);
  const canView = role !== null;

  const canManage =
    user.role === "ADMIN" ||
    (user.role === "PROJECT_MANAGER" && role === "MANAGER");

  const canChangeStatus =
    canManage ||
    ((user.role === "PROJECT_MANAGER" || user.role === "TEAM_MEMBER") &&
      (role === "MANAGER" || role === "MEMBER"));

  const canComment = canView && user.role !== "VIEWER" && role !== "VIEWER";

  return { project, membership, role, canView, canManage, canChangeStatus, canComment };
}

/**
 * Loads a project and the caller's access. Hidden projects (no access) and
 * missing ids both yield 404 so project existence is never leaked.
 */
export async function loadProjectAccess(
  user: SafeUser,
  projectId: string,
): Promise<ProjectAccess> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId: user.id } } },
  });
  if (!project) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  const access = resolveProjectAccess(user, project, project.members[0] ?? null);
  if (!access.canView) {
    throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  }
  return access;
}

export function assertCanManage(access: ProjectAccess): void {
  if (!access.canManage) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to manage this project.",
    );
  }
}

export function assertCanChangeStatus(access: ProjectAccess): void {
  if (!access.canChangeStatus) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "You do not have permission to change task status in this project.",
    );
  }
}

export function assertCanComment(access: ProjectAccess): void {
  if (!access.canComment) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to comment here.");
  }
}

/** A user may be assigned to project work only if they can view the project. */
export async function assertAssignableToProject(
  projectId: string,
  userId: string,
): Promise<void> {
  const [target, membership] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }),
    prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    }),
  ]);
  if (!target || !target.isActive) {
    throw new AppError(400, "INVALID_ASSIGNEE", "The selected user is inactive or does not exist.");
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerId: true },
  });
  const isOwner = project?.managerId === userId;
  if (!membership && !isOwner) {
    throw new AppError(
      400,
      "INVALID_ASSIGNEE",
      "The selected user is not a member of this project.",
    );
  }
}

export function requireSystemRole(user: SafeUser, ...roles: SystemRole[]): void {
  if (!roles.includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
}
