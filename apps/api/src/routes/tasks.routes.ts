import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { requireUser } from "../lib/permissions";
import {
  commentSchema,
  taskCommentParamsSchema,
  taskIdParamSchema,
  updateTaskSchema,
  type CommentInput,
  type UpdateTaskInput,
} from "../schemas/task.schema";
import {
  addComment,
  deleteComment,
  deleteTask,
  getTask,
  listComments,
  updateTask,
} from "../services/task.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/** GET /api/tasks/:id - task detail, comments and caller permissions. */
router.get(
  "/:id",
  validate(taskIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await getTask(requireUser(req), req.params.id) });
  }),
);

/** PATCH /api/tasks/:id - optimistic update; expected `version` required (stale => 409). */
router.patch(
  "/:id",
  validate(taskIdParamSchema, "params"),
  validate(updateTaskSchema),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await updateTask(requireUser(req), req.params.id, req.body as UpdateTaskInput) });
  }),
);

/** DELETE /api/tasks/:id - managers/admins only. */
router.delete(
  "/:id",
  validate(taskIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json(await deleteTask(requireUser(req), req.params.id));
  }),
);

/** GET /api/tasks/:id/comments - comment thread. */
router.get(
  "/:id/comments",
  validate(taskIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await listComments(requireUser(req), req.params.id) });
  }),
);

/** POST /api/tasks/:id/comments - viewers cannot comment. */
router.post(
  "/:id/comments",
  validate(taskIdParamSchema, "params"),
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const comment = await addComment(requireUser(req), req.params.id, req.body as CommentInput);
    res.status(201).json({ data: comment });
  }),
);

/** DELETE /api/tasks/:id/comments/:commentId - author or project manager. */
router.delete(
  "/:id/comments/:commentId",
  validate(taskCommentParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json(await deleteComment(requireUser(req), req.params.id, req.params.commentId));
  }),
);

export default router;
