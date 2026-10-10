import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorizeRoles } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { requireUser } from "../lib/permissions";
import {
  addMemberSchema,
  createProjectSchema,
  memberParamsSchema,
  projectIdParamSchema,
  projectListQuerySchema,
  updateMemberSchema,
  updateProjectSchema,
  type AddMemberInput,
  type CreateProjectInput,
  type ProjectListQuery,
  type UpdateMemberInput,
  type UpdateProjectInput,
} from "../schemas/project.schema";
import {
  activityListQuerySchema,
  createTaskSchema,
  taskListQuerySchema,
  type CreateTaskInput,
  type TaskListQuery,
} from "../schemas/task.schema";
import {
  addMember,
  createProject,
  getProject,
  listMembers,
  listProjects,
  removeMember,
  updateMemberRole,
  updateProject,
} from "../services/project.service";
import { createTask, listTasks } from "../services/task.service";
import { listProjectActivity } from "../services/activity.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(authenticate);

/** GET /api/projects - projects visible to the caller (admin sees all). */
router.get(
  "/",
  validate(projectListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.status(200).json(await listProjects(requireUser(req), req.query as unknown as ProjectListQuery));
  }),
);

/** POST /api/projects - administrators create projects. */
router.post(
  "/",
  authorizeRoles("ADMIN"),
  validate(createProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await createProject(requireUser(req), req.body as CreateProjectInput);
    res.status(201).json({ data: project });
  }),
);

/** GET /api/projects/:id - project detail with caller permissions. */
router.get(
  "/:id",
  validate(projectIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await getProject(requireUser(req), req.params.id) });
  }),
);

/** PATCH /api/projects/:id - update/archive; manager reassignment is admin-only. */
router.patch(
  "/:id",
  validate(projectIdParamSchema, "params"),
  validate(updateProjectSchema),
  asyncHandler(async (req, res) => {
    const project = await updateProject(
      requireUser(req),
      req.params.id,
      req.body as UpdateProjectInput,
    );
    res.status(200).json({ data: project });
  }),
);

/** GET /api/projects/:id/members - team listing. */
router.get(
  "/:id/members",
  validate(projectIdParamSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: await listMembers(requireUser(req), req.params.id) });
  }),
);

/** POST /api/projects/:id/members - add a member (duplicate => 409). */
router.post(
  "/:id/members",
  validate(projectIdParamSchema, "params"),
  validate(addMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await addMember(requireUser(req), req.params.id, req.body as AddMemberInput);
    res.status(201).json({ data: member });
  }),
);

/** PATCH /api/projects/:id/members/:memberId - change project role. */
router.patch(
  "/:id/members/:memberId",
  validate(memberParamsSchema, "params"),
  validate(updateMemberSchema),
  asyncHandler(async (req, res) => {
    const member = await updateMemberRole(
      requireUser(req),
      req.params.id,
      req.params.memberId,
      req.body as UpdateMemberInput,
    );
    res.status(200).json({ data: member });
  }),
);

/** DELETE /api/projects/:id/members/:memberId - remove a member. */
router.delete(
  "/:id/members/:memberId",
  validate(memberParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    res.status(200).json(await removeMember(requireUser(req), req.params.id, req.params.memberId));
  }),
);

/** GET /api/projects/:id/tasks - filterable task list for the project. */
router.get(
  "/:id/tasks",
  validate(projectIdParamSchema, "params"),
  validate(taskListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.status(200).json(
      await listTasks(requireUser(req), req.params.id, req.query as unknown as TaskListQuery),
    );
  }),
);

/** POST /api/projects/:id/tasks - managers/admins create tasks. */
router.post(
  "/:id/tasks",
  validate(projectIdParamSchema, "params"),
  validate(createTaskSchema),
  asyncHandler(async (req, res) => {
    const task = await createTask(requireUser(req), req.params.id, req.body as CreateTaskInput);
    res.status(201).json({ data: task });
  }),
);

/** GET /api/projects/:id/activity - paginated activity history. */
router.get(
  "/:id/activity",
  validate(projectIdParamSchema, "params"),
  validate(activityListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    res.status(200).json(
      await listProjectActivity(requireUser(req), req.params.id, req.query as unknown as { page: number; limit: number }),
    );
  }),
);

export default router;
