import type { ApiErrorBody, SafeUser } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
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
    );
  }

  return payload as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<{ user: SafeUser }>("/api/auth/login", { method: "POST", body: { email, password } }),
  logout: () => apiRequest<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => apiRequest<{ user: SafeUser }>("/api/auth/me"),
};
