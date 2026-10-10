import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  notificationIdParamSchema,
  notificationListQuerySchema,
  type NotificationListQuery,
} from "../schemas/notification.schema";
import {
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
} from "../services/notification.service";
import { requireUser } from "../lib/permissions";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/** GET /api/notifications - the caller's notifications (+ live unreadCount). */
router.get(
  "/",
  validate(notificationListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.status(200).json(
      await listNotifications(requireUser(req), req.query as unknown as NotificationListQuery),
    );
  }),
);

/** GET /api/notifications/unread-count - lightweight badge poll. */
router.get("/unread-count", asyncHandler(async (req, res) => {
  res.status(200).json({ unreadCount: await unreadCount(requireUser(req)) });
}));

/** PATCH /api/notifications/:id/read - mark one as read (own records only). */
router.patch(
  "/:id/read",
  validate(notificationIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await markRead(requireUser(req), req.params.id) });
  }),
);

/** POST /api/notifications/read-all - mark everything as read. */
router.post("/read-all", asyncHandler(async (req, res) => {
  res.status(200).json(await markAllRead(requireUser(req)));
}));

export default router;
