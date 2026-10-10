import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(254)
    .email("Enter a valid email address."),
  password: z.string().min(1, "Password is required.").max(128),
});

/**
 * Profile updates are deliberately limited to `name` - identity fields such as
 * email or role are managed through the admin user-management endpoints.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(100),
  })
  .strict();
