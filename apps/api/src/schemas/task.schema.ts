import { z } from "zod";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(200),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(TASK_STATUSES).default("TODO"),
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    assigneeId: z.string().cuid("Invalid assignee id.").nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .strict();

/**
 * Optimistic concurrency: `version` is the client's expected version and is
 * required on every update. The write is conditional on it (see task.service).
 */
export const updateTaskSchema = z
  .object({
    version: z.number().int().min(1, "Expected version is required."),
    title: z.string().trim().min(1, "Title is required.").max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    assigneeId: z.string().cuid("Invalid assignee id.").nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).some((key) => key !== "version"), {
    message: "Provide at least one field to update.",
  });

export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().cuid("Invalid assignee id.").optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export const taskIdParamSchema = z.object({
  id: z.string().cuid("Invalid task id."),
});

export const commentSchema = z
  .object({
    content: z.string().trim().min(1, "Comment cannot be empty.").max(2000),
  })
  .strict();

export const taskCommentParamsSchema = z.object({
  id: z.string().cuid("Invalid task id."),
  commentId: z.string().cuid("Invalid comment id."),
});

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
export type CommentInput = z.infer<typeof commentSchema>;
