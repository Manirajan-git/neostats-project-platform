import { z } from "zod";

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
export const PROJECT_ROLES = ["MANAGER", "MEMBER", "VIEWER"] as const;

const name = z.string().trim().min(1, "Project name is required.").max(120);
const description = z.string().trim().max(2000).optional();

export const createProjectSchema = z
  .object({
    name,
    description,
    status: z.enum(PROJECT_STATUSES).optional(),
    managerId: z.string().cuid("Invalid manager id.").optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: name.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
    managerId: z.string().cuid("Invalid manager id.").nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update.",
  });

export const projectListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const projectIdParamSchema = z.object({
  id: z.string().cuid("Invalid project id."),
});

export const memberParamsSchema = z.object({
  id: z.string().cuid("Invalid project id."),
  memberId: z.string().cuid("Invalid member id."),
});

export const addMemberSchema = z
  .object({
    userId: z.string().cuid("Invalid user id."),
    role: z.enum(PROJECT_ROLES).default("MEMBER"),
  })
  .strict();

export const updateMemberSchema = z
  .object({
    role: z.enum(PROJECT_ROLES),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
