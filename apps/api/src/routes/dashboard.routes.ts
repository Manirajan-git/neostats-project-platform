import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorizeRoles } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { requireUser } from "../lib/permissions";
import { activityListQuerySchema } from "../schemas/task.schema";
import { getDashboard } from "../services/dashboard.service";
import { listPlatformActivity } from "../services/activity.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/** GET /api/dashboard - role-scoped summary built from real project/task data. */
router.get("/", asyncHandler(async (req, res) => {
  res.status(200).json({ data: await getDashboard(requireUser(req)) });
}));

export const activityRouter = Router();

activityRouter.use(authenticate, authorizeRoles("ADMIN"));

/** GET /api/activity - platform-wide activity feed (administrators only). */
activityRouter.get(
  "/",
  validate(activityListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.status(200).json(
      await listPlatformActivity(
        requireUser(req),
        req.query as unknown as { page: number; limit: number },
      ),
    );
  }),
);

export default router;
