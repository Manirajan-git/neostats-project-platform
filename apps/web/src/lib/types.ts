export type SystemRole = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type ProjectRole = "MANAGER" | "MEMBER" | "VIEWER";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: SystemRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
    meta?: Record<string, unknown>;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TaskCounts {
  TODO: number;
  IN_PROGRESS: number;
  BLOCKED: number;
  DONE: number;
  total: number;
}

export interface ProjectPermissions {
  canManage: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
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
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  permissions: ProjectPermissions;
}

export interface MemberRow {
  id: string;
  role: ProjectRole;
  isOwner: boolean;
  createdAt: string;
  user: SafeUser;
}

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
  dueDate: string | null;
  version: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPermissions {
  canEdit: boolean;
  canChangeStatus: boolean;
  canComment: boolean;
  canDelete: boolean;
}

export interface CommentRow {
  id: string;
  content: string;
  author: { id: string; name: string; email: string };
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  project: { id: string; name: string; status: string };
  permissions: TaskPermissions;
  comments: CommentRow[];
}

export interface ActivityRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  projectId: string | null;
  projectName: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; name: string; email: string } | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  projectId: string | null;
  read: boolean;
  createdAt: string;
}

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
    dueDate: string;
    status: TaskStatus;
    priority: TaskPriority;
    projectId: string;
    projectName: string;
    assigneeName: string | null;
  }[];
  recentActivity: {
    id: string;
    summary: string;
    action: string;
    projectName: string | null;
    createdAt: string;
    actorName: string | null;
  }[];
  unreadNotifications: number;
}

export const ROLE_LABELS: Record<SystemRole, string> = {
  ADMIN: "Administrator",
  PROJECT_MANAGER: "Project Manager",
  TEAM_MEMBER: "Team Member",
  VIEWER: "Viewer",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  MANAGER: "Manager",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};
