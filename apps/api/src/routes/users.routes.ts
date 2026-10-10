import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorizeRoles } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createUserSchema,
  paginationSchema,
  updateUserSchema,
  userIdParamSchema,
  type CreateUserInput,
  type PaginationInput,
  type UpdateUserInput,
} from "../schemas/user.schema";
import {
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  updateUser,
} from "../services/user.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Entire collection is Admin-only; 401 handled by authenticate, 403 by authorizeRoles.
router.use(authenticate, authorizeRoles("ADMIN"));

/** GET /api/users - paginated, searchable user list. */
router.get(
  "/",
  validate(paginationSchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as PaginationInput;
    res.status(200).json(await listUsers(query));
  }),
);

/** GET /api/users/:id - single user. */
router.get(
  "/:id",
  validate(userIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await getUser(req.params.id) });
  }),
);

/** POST /api/users - create a user (Admin only). */
router.post(
  "/",
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as CreateUserInput;
    res.status(201).json({ data: await createUser(input) });
  }),
);

/** PATCH /api/users/:id - update allowlisted fields (name, email, role, password). */
router.patch(
  "/:id",
  validate(userIdParamSchema, "params"),
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as UpdateUserInput;
    res.status(200).json({ data: await updateUser(req.params.id, input) });
  }),
);

/** PATCH /api/users/:id/deactivate - soft deactivation (never deletes). */
router.patch(
  "/:id/deactivate",
  validate(userIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    const actor = req.user;
    if (!actor) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "Authentication required." } });
    }
    res.status(200).json({ data: await deactivateUser(req.params.id, actor.id) });
  }),
);

export default router;
