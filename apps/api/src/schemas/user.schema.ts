import { z } from "zod";

/** Single source of truth for system roles (mirrors Prisma enum SystemRole). */
export const SYSTEM_ROLES = [
  "ADMIN",
  "PROJECT_MANAGER",
  "TEAM_MEMBER",
  "VIEWER",
] as const;

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password must contain at least one letter.")
  .regex(/[0-9]/, "Password must contain at least one number.");

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().min(1).max(100).optional(),
});

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(254)
      .email("Enter a valid email address."),
    password: passwordSchema,
    role: z.enum(SYSTEM_ROLES, {
      errorMap: () => ({ message: `Role must be one of: ${SYSTEM_ROLES.join(", ")}.` }),
    }),
  })
  .strict();

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(3)
      .max(254)
      .email("Enter a valid email address.")
      .optional(),
    role: z
      .enum(SYSTEM_ROLES, {
        errorMap: () => ({ message: `Role must be one of: ${SYSTEM_ROLES.join(", ")}.` }),
      })
      .optional(),
    password: passwordSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update.",
  });

export const userIdParamSchema = z.object({
  id: z.string().cuid("Invalid user id."),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
