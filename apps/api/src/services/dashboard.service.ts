import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { SafeUser } from "../types/dto";

export interface DashboardData {
  projects: {
    total: number;
    active: number;
    onHold: number;
    completed: number;
    archived: number;
    managed: number;
  };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    assignedToMe: { total: number; overdue: number; dueSoon: number };
  };
  upcomingDeadlines: {
    id: string;
    title: string;
    dueDate: Date;
    status: TaskStatus;
    priority: string;
    projectId: string;
    projectName: string;
    assigneeName: string | null;
  }[];
  recentActivity: {
    id: string;
    summary: string;
    action: string;
    projectName: string | null;
    createdAt: Date;
    actorName: string | null;
  }[];
  unreadNotifications: number;
}

const inHours = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);

export async function getDashboard(user: SafeUser): Promise<DashboardData> {
  const scope: Prisma.ProjectWhereInput =
    user.role === "ADMIN"
      ? {}
      : {
          OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }],
        };

  const projects = await prisma.project.findMany({
    where: scope,
    select: { id: true, status: true, managerId: true },
  });
  const projectIds = projects.map((p) => p.id);

  const [
    tasksByStatus,
    assigned,
    overdue,
    dueSoon,
    upcoming,
    recent,
    unread,
  ] = await Promise.all([
    prisma.task.groupBy({
      by: ["status"],
      where: { projectId: { in: projectIds } },
      _count: { _all: true },
    }),
    prisma.task.count({
      where: { assigneeId: user.id, projectId: { in: projectIds } },
    }),
    prisma.task.count({
      where: {
        assigneeId: user.id,
        projectId: { in: projectIds },
        status: { not: "DONE" },
        dueDate: { lt: new Date() },
      },
    }),
    prisma.task.count({
      where: {
        assigneeId: user.id,
        projectId: { in: projectIds },
        status: { not: "DONE" },
        dueDate: { gte: new Date(), lte: inHours(24 * 7) },
      },
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        status: { not: "DONE" },
        dueDate: { gte: new Date(), lte: inHours(24 * 14) },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        priority: true,
        projectId: true,
        project: { select: { name: true } },
        assignee: { select: { name: true } },
      },
    }),
    prisma.activityLog.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        summary: true,
        action: true,
        createdAt: true,
        project: { select: { name: true } },
        actor: { select: { name: true } },
      },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  const byStatus: Record<TaskStatus, number> = {
    TODO: 0,
    IN_PROGRESS: 0,
    BLOCKED: 0,
    DONE: 0,
  };
  for (const row of tasksByStatus) byStatus[row.status] = row._count._all;

  const statusCounts = { ACTIVE: 0, ON_HOLD: 0, COMPLETED: 0, ARCHIVED: 0 };
  let managed = 0;
  for (const project of projects) {
    statusCounts[project.status] += 1;
    if (project.managerId === user.id) managed += 1;
  }

  const totalTasks = Object.values(byStatus).reduce((sum, n) => sum + n, 0);

  return {
    projects: {
      total: projects.length,
      active: statusCounts.ACTIVE,
      onHold: statusCounts.ON_HOLD,
      completed: statusCounts.COMPLETED,
      archived: statusCounts.ARCHIVED,
      managed,
    },
    tasks: {
      total: totalTasks,
      byStatus,
      assignedToMe: { total: assigned, overdue, dueSoon },
    },
    upcomingDeadlines: upcoming.map((task) => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate!,
      status: task.status,
      priority: task.priority,
      projectId: task.projectId,
      projectName: task.project.name,
      assigneeName: task.assignee?.name ?? null,
    })),
    recentActivity: recent.map((row) => ({
      id: row.id,
      summary: row.summary,
      action: row.action,
      projectName: row.project?.name ?? null,
      createdAt: row.createdAt,
      actorName: row.actor?.name ?? null,
    })),
    unreadNotifications: unread,
  };
}
