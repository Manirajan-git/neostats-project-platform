import type {
  ActivityRow,
  ApiErrorBody,
  DashboardData,
  MemberRow,
  NotificationRow,
  PaginationMeta,
  ProjectDetail,
  ProjectRole,
  ProjectStatus,
  ProjectSummary,
  SafeUser,
  SystemRole,
  TaskDetail,
  TaskPriority,
  TaskStatus,
  TaskSummary,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
    /** Extra safe payload from the server (e.g. current task on a 409). */
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

/** Fetch wrapper: always sends cookies, never stores tokens in browser storage. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the API. Is the backend running on port 4000?");
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const apiError = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      apiError?.code ?? "UNKNOWN_ERROR",
      apiError?.message ?? "Request failed. Please try again.",
      apiError?.details,
      apiError?.meta,
    );
  }

  return payload as T;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : "";
}

interface Paged<T> {
  data: T[];
  meta: PaginationMeta;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ user: SafeUser }>("/api/auth/login", { method: "POST", body: { email, password } }),
  logout: () => apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => apiRequest<{ user: SafeUser }>("/api/auth/me"),
  updateProfile: (name: string) =>
    apiRequest<{ user: SafeUser }>("/api/auth/profile", { method: "PATCH", body: { name } }),
};

export const dashboardApi = {
  get: () => apiRequest<{ data: DashboardData }>("/api/dashboard"),
};

export const projectsApi = {
  list: (params: { page?: number; limit?: number; q?: string; status?: ProjectStatus } = {}) =>
    apiRequest<Paged<ProjectSummary>>(`/api/projects${query(params)}`),
  create: (body: { name: string; description?: string; managerId?: string }) =>
    apiRequest<{ data: ProjectDetail }>("/api/projects", { method: "POST", body }),
  get: (id: string) => apiRequest<{ data: ProjectDetail }>(`/api/projects/${id}`),
  update: (
    id: string,
    body: { name?: string; description?: string | null; status?: ProjectStatus; managerId?: string | null },
  ) => apiRequest<{ data: ProjectDetail }>(`/api/projects/${id}`, { method: "PATCH", body }),
  members: {
    list: (projectId: string) =>
      apiRequest<{ data: MemberRow[] }>(`/api/projects/${projectId}/members`),
    add: (projectId: string, body: { userId: string; role: ProjectRole }) =>
      apiRequest<{ data: MemberRow }>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body,
      }),
    updateRole: (projectId: string, memberId: string, role: ProjectRole) =>
      apiRequest<{ data: MemberRow }>(`/api/projects/${projectId}/members/${memberId}`, {
        method: "PATCH",
        body: { role },
      }),
    remove: (projectId: string, memberId: string) =>
      apiRequest<{ success: boolean }>(`/api/projects/${projectId}/members/${memberId}`, {
        method: "DELETE",
      }),
  },
  tasks: {
    list: (
      projectId: string,
      params: {
        page?: number;
        limit?: number;
        status?: TaskStatus;
        priority?: TaskPriority;
        assigneeId?: string;
        q?: string;
      } = {},
    ) =>
      apiRequest<
        Paged<TaskSummary> & {
        permissions: { canManage: boolean; canChangeStatus: boolean; canComment: boolean };
      }
      >(`/api/projects/${projectId}/tasks${query(params)}`),
    create: (
      projectId: string,
      body: {
        title: string;
        description?: string | null;
        status?: TaskStatus;
        priority?: TaskPriority;
        assigneeId?: string | null;
        dueDate?: string | null;
      },
    ) => apiRequest<{ data: TaskSummary }>(`/api/projects/${projectId}/tasks`, { method: "POST", body }),
  },
  activity: (projectId: string, params: { page?: number; limit?: number } = {}) =>
    apiRequest<Paged<ActivityRow>>(`/api/projects/${projectId}/activity${query(params)}`),
};

export const tasksApi = {
  get: (id: string) => apiRequest<{ data: TaskDetail }>(`/api/tasks/${id}`),
  update: (
    id: string,
    body: {
      version: number;
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      assigneeId?: string | null;
      dueDate?: string | null;
    },
  ) => apiRequest<{ data: TaskDetail }>(`/api/tasks/${id}`, { method: "PATCH", body }),
  remove: (id: string) => apiRequest<{ success: boolean }>(`/api/tasks/${id}`, { method: "DELETE" }),
  comments: {
    create: (taskId: string, content: string) =>
      apiRequest<{ data: { id: string; content: string } }>(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        body: { content },
      }),
    remove: (taskId: string, commentId: string) =>
      apiRequest<{ success: boolean }>(`/api/tasks/${taskId}/comments/${commentId}`, {
        method: "DELETE",
      }),
  },
};

export const notificationsApi = {
  list: (params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) =>
    apiRequest<Paged<NotificationRow> & { unreadCount: number }>(
      `/api/notifications${query(params)}`,
    ),
  unreadCount: () => apiRequest<{ unreadCount: number }>("/api/notifications/unread-count"),
  markRead: (id: string) =>
    apiRequest<{ data: NotificationRow }>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () =>
    apiRequest<{ updated: number }>("/api/notifications/read-all", { method: "POST" }),
};

export const usersApi = {
  list: (params: { page?: number; limit?: number; q?: string } = {}) =>
    apiRequest<Paged<SafeUser>>(`/api/users${query(params)}`),
  create: (body: { name: string; email: string; password: string; role: SystemRole }) =>
    apiRequest<{ data: SafeUser }>("/api/users", { method: "POST", body }),
  update: (id: string, body: { name?: string; email?: string; role?: SystemRole; password?: string }) =>
    apiRequest<{ data: SafeUser }>(`/api/users/${id}`, { method: "PATCH", body }),
  setActive: (id: string, path: "deactivate" | "activate") =>
    apiRequest<{ data: SafeUser }>(`/api/users/${id}/${path}`, { method: "PATCH" }),
  directory: (q?: string) =>
    apiRequest<{ data: Pick<SafeUser, "id" | "name" | "email" | "role">[] }>(
      `/api/users/directory${query({ q })}`,
    ),
};

export const activityApi = {
  platform: (params: { page?: number; limit?: number } = {}) =>
    apiRequest<Paged<ActivityRow>>(`/api/activity${query(params)}`),
};
