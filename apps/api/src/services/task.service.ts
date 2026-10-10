import type { Comment, Task, TaskPriority, TaskStatus } from "@prisma/client";
import type { SafeUser } from "../types/dto";
import { prisma } from "../lib/prisma";
import { recordActivity, notifyUsers } from "../lib/journal";
import {
  assertAssignableToProject,
  assertCanComment,
  assertCanManage,
  loadProjectAccess,
  resolveProjectAccess,
  type ProjectAccess,
} from "../lib/permissions";
import { AppError } from "../utils/errors";
import type { PaginationMeta } from "../types/dto";
import type {
  CommentInput,
  CreateTaskInput,
  TaskListQuery,
  UpdateTaskInput,
} from "../schemas/task.schema";

export interface TaskSummary {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  projectName: string;
  assignee: { id: string; name: string; email: string } | null;
  creator: { id: string; name: string } | null;
  dueDate: Date | null;
  version: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskPermissions {
  canEdit: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
  canDelete: boolean;
}

export interface TaskDetail extends TaskSummary {
  project: { id: string; name: string; status: string };
  permissions: TaskPermissions;
  comments?: CommentRow[];
}

export interface CommentRow {
  id: string;
  content: string;
  author: { id: string; name: string; email: string };
  createdAt: Date;
}

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} as const;

type TaskWithExtras = Task & {
  assignee: { id: string; name: string; email: string } | null;
  creator: { id: string; name: string } | null;
  project: { id: string; name: string };
  _count: { comments: number };
};

function toSummary(task: TaskWithExtras): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    projectName: task.project.name,
    assignee: task.assignee,
    creator: task.creator,
    dueDate: task.dueDate,
    version: task.version,
    commentCount: task._count.comments,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function permissionsFor(access: ProjectAccess): TaskPermissions {
  return {
    canEdit: access.canManage,
    canChangeStatus: access.canChangeStatus,
    canComment: access.canComment,
    canDelete: access.canManage,
  };
}

/** Loads a task together with access to its project (404 when the project is hidden). */
async function loadTaskAccess(user: SafeUser, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { members: { where: { userId: user.id } } } } },
  });
  if (!task) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  const membership = task.project.members[0] ?? null;
  const access = resolveProjectAccess(user, task.project, membership);
  if (!access.canView) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  return { task, access };
}

export async function listTasks(user: SafeUser, projectId: string, query: TaskListQuery) {
  const access = await loadProjectAccess(user, projectId);

  const filters = [
    { projectId },
    query.status ? { status: query.status } : {},
    query.priority ? { priority: query.priority } : {},
    query.assigneeId ? { assigneeId: query.assigneeId } : {},
    query.q ? { title: { contains: query.q, mode: "insensitive" as const } } : {},
  ].filter((clause) => Object.keys(clause).length > 0);

  const where = { AND: filters };
  const [total, tasks] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: taskInclude,
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
    data: tasks.map(toSummary),
    meta,
    permissions: {
      canManage: access.canManage,
      canChangeStatus: access.canChangeStatus,
      canComment: access.canComment,
    },
  };
}

export async function createTask(user: SafeUser, projectId: string, input: CreateTaskInput) {
  const access = await loadProjectAccess(user, projectId);
  assertCanManage(access);

  if (input.assigneeId) {
    await assertAssignableToProject(projectId, input.assigneeId);
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
        projectId,
        creatorId: user.id,
      },
      include: taskInclude,
    });
    await recordActivity(tx, {
      actorId: user.id,
      projectId,
      action: "task.created",
      entityType: "TASK",
      entityId: created.id,
      summary: `${user.name} created task "${created.title}"`,
      metadata: { status: created.status, priority: created.priority },
    });
    await notifyUsers(tx, user.id, [created.assigneeId], {
      type: "TASK_ASSIGNED",
      message: `You were assigned "${created.title}" in ${access.project.name}`,
      entityType: "TASK",
      entityId: created.id,
      projectId,
    });
    return created;
  });

  return toSummary(task);
}

export async function getTask(user: SafeUser, taskId: string): Promise<TaskDetail> {
  const { task, access } = await loadTaskAccess(user, taskId);
  const full = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      ...taskInclude,
      project: { select: { id: true, name: true, status: true } },
      comments: {
        include: { author: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!full) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");

  const base = toSummary({ ...full, project: { id: full.project.id, name: full.project.name } });
  return {
    ...base,
    project: full.project,
    permissions: permissionsFor(access),
    comments: full.comments.map((c) => ({
      id: c.id,
      content: c.content,
      author: c.author,
      createdAt: c.createdAt,
    })),
  };
}

/** Fields a caller may write given their project role. */
function allowedUpdateFields(access: ProjectAccess): Set<string> {
  if (access.canManage) {
    return new Set(["title", "description", "status", "priority", "assigneeId", "dueDate"]);
  }
  if (access.canChangeStatus) return new Set(["status"]);
  return new Set();
}

export async function updateTask(user: SafeUser, taskId: string, input: UpdateTaskInput): Promise<TaskDetail> {
  const { task, access } = await loadTaskAccess(user, taskId);

  const { version, ...fields } = input;
  const provided = Object.keys(fields);
  const allowed = allowedUpdateFields(access);
  const forbidden = provided.filter((key) => !allowed.has(key));
  if (forbidden.length > 0) {
    if (allowed.size === 0) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to modify tasks in this project.");
    }
    throw new AppError(
      403,
      "FORBIDDEN",
      "Your role in this project only allows status changes on tasks.",
    );
  }

  if (fields.assigneeId) {
    await assertAssignableToProject(task.projectId, fields.assigneeId);
  }

  const data: Record<string, unknown> = { version: { increment: 1 } };
  if (fields.title !== undefined) data.title = fields.title;
  if (fields.description !== undefined) data.description = fields.description;
  if (fields.status !== undefined) data.status = fields.status;
  if (fields.priority !== undefined) data.priority = fields.priority;
  if (fields.assigneeId !== undefined) data.assigneeId = fields.assigneeId;
  if (fields.dueDate !== undefined) data.dueDate = fields.dueDate;

  // Atomic optimistic-concurrency guard: the WHERE clause includes the expected
  // version, so a stale write matches zero rows and can never overwrite data.
  const result = await prisma.task.updateMany({
    where: { id: taskId, version },
    data,
  });

  if (result.count === 0) {
    const current = await prisma.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });
    if (!current) throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
    throw new AppError(
      409,
      "TASK_VERSION_CONFLICT",
      "This task was updated by someone else. Reload to see the latest version.",
      undefined,
      { task: toSummary(current) },
    );
  }

  const updated = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });

  const statusChanged = fields.status !== undefined && fields.status !== task.status;
  const assigneeChanged =
    fields.assigneeId !== undefined && fields.assigneeId !== task.assigneeId;

  await prisma.$transaction(async (tx) => {
    if (statusChanged) {
      await recordActivity(tx, {
        actorId: user.id,
        projectId: task.projectId,
        action: "task.status_changed",
        entityType: "TASK",
        entityId: taskId,
        summary: `${user.name} moved "${updated.title}" to ${updated.status.replace("_", " ").toLowerCase()}`,
        metadata: { from: task.status, to: updated.status },
      });
    }
    if (assigneeChanged) {
      await recordActivity(tx, {
        actorId: user.id,
        projectId: task.projectId,
        action: "task.assigned",
        entityType: "TASK",
        entityId: taskId,
        summary: `${user.name} ${updated.assigneeId ? `assigned "${updated.title}"` : `unassigned "${updated.title}"`}`,
      });
    }
    if (!statusChanged && !assigneeChanged) {
      await recordActivity(tx, {
        actorId: user.id,
        projectId: task.projectId,
        action: "task.updated",
        entityType: "TASK",
        entityId: taskId,
        summary: `${user.name} updated task "${updated.title}"`,
        metadata: { fields: provided },
      });
    }
    if (assigneeChanged && updated.assigneeId) {
      await notifyUsers(tx, user.id, [updated.assigneeId], {
        type: "TASK_ASSIGNED",
        message: `You were assigned "${updated.title}" in ${updated.project.name}`,
        entityType: "TASK",
        entityId: taskId,
        projectId: task.projectId,
      });
    }
    if (statusChanged && updated.assigneeId) {
      await notifyUsers(tx, user.id, [updated.assigneeId], {
        type: "TASK_STATUS_CHANGED",
        message: `"${updated.title}" is now ${updated.status.replace("_", " ").toLowerCase()}`,
        entityType: "TASK",
        entityId: taskId,
        projectId: task.projectId,
      });
    }
  });

  return getTask(user, taskId);
}

export async function deleteTask(user: SafeUser, taskId: string): Promise<{ success: true }> {
  const { task, access } = await loadTaskAccess(user, taskId);
  assertCanManage(access);

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });
    await recordActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      action: "task.deleted",
      entityType: "TASK",
      entityId: taskId,
      summary: `${user.name} deleted task "${task.title}"`,
    });
  });
  return { success: true };
}

export async function listComments(user: SafeUser, taskId: string): Promise<CommentRow[]> {
  const { access } = await loadTaskAccess(user, taskId);
  void access;
  const comments = await prisma.comment.findMany({
    where: { taskId },
    include: { author: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return comments.map((c) => ({ id: c.id, content: c.content, author: c.author, createdAt: c.createdAt }));
}

export async function addComment(
  user: SafeUser,
  taskId: string,
  input: CommentInput,
): Promise<CommentRow> {
  const { task, access } = await loadTaskAccess(user, taskId);
  assertCanComment(access);

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { taskId, authorId: user.id, content: input.content },
      include: { author: { select: { id: true, name: true, email: true } } },
    });
    await recordActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      action: "comment.created",
      entityType: "COMMENT",
      entityId: created.id,
      summary: `${user.name} commented on "${task.title}"`,
    });
    await notifyUsers(tx, user.id, [task.assigneeId, task.creatorId], {
      type: "COMMENT_ADDED",
      message: `${user.name} commented on "${task.title}"`,
      entityType: "TASK",
      entityId: taskId,
      projectId: task.projectId,
    });
    return created;
  });

  return { id: comment.id, content: comment.content, author: comment.author, createdAt: comment.createdAt };
}

export async function deleteComment(
  user: SafeUser,
  taskId: string,
  commentId: string,
): Promise<{ success: true }> {
  const { task, access } = await loadTaskAccess(user, taskId);
  const comment: Comment | null = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment || comment.taskId !== taskId) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }
  const isAuthor = comment.authorId === user.id;
  if (!isAuthor && !access.canManage) {
    throw new AppError(403, "FORBIDDEN", "You can only delete your own comments.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: commentId } });
    await recordActivity(tx, {
      actorId: user.id,
      projectId: task.projectId,
      action: "comment.deleted",
      entityType: "COMMENT",
      entityId: commentId,
      summary: `${user.name} deleted a comment on "${task.title}"`,
    });
  });
  return { success: true };
}
