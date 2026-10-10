export interface FieldIssue {
  path: string;
  message: string;
}

/** Application error that is safe to serialise to API clients. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: FieldIssue[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
