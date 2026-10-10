import { z } from "zod";

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export const notificationIdParamSchema = z.object({
  id: z.string().cuid("Invalid notification id."),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
