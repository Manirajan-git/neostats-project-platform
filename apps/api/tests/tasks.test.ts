import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  app,
  asUser,
  cleanupCreatedUsers,
  cleanupTrackedProjects,
  createProjectFixture,
  createUser,
  loginAs,
  type TestUser,
} from "./helpers";

describe("tasks (CRUD, assignment, role permissions)", () => {
  let pm: TestUser;
  let member: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let pmCookie: string;
  let memberCookie: string;
  let viewerCookie: string;
  let outsiderCookie: string;

  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    pm = await createUser({ tag: "task-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "task-member", role: "TEAM_MEMBER" });
    viewer = await createUser({ tag: "task-viewer", role: "VIEWER" });
    outsider = await createUser({ tag: "task-outsider", role: "TEAM_MEMBER" });

    pmCookie = await loginAs(pm.user.email, pm.password);
    memberCookie = await loginAs(member.user.email, member.password);
    viewerCookie = await loginAs(viewer.user.email, viewer.password);
    outsiderCookie = await loginAs(outsider.user.email, outsider.password);

    const project = await createProjectFixture({
      name: `Tasks ${Date.now()}`,
      managerId: pm.user.id,
      members: [
        { userId: member.user.id, role: "MEMBER" },
        { userId: viewer.user.id, role: "VIEWER" },
      ],
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. the project manager creates an assigned task (201, version 1)", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({
        title: "Design review checklist",
        description: "Walk through the acceptance criteria",
        assigneeId: member.user.id,
        priority: "HIGH",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: "Design review checklist",
      status: "TODO",
      priority: "HIGH",
      version: 1,
      projectId,
      commentCount: 0,
    });
    expect(res.body.data.assignee.id).toBe(member.user.id);
    expect(res.body.data.creator.id).toBe(pm.user.id);
    taskId = res.body.data.id;
  });

  it("2. regular members and viewers cannot create tasks", async () => {
    const memberCreate = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(memberCookie))
      .send({ title: "Member task" });
    expect(memberCreate.status).toBe(403);

    const viewerCreate = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(viewerCookie))
      .send({ title: "Viewer task" });
    expect(viewerCreate.status).toBe(403);
  });

  it("3. assigning to a non-member returns 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Bad assignment", assigneeId: outsider.user.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ASSIGNEE");
  });

  it("4. members can read tasks; outsiders get 404", async () => {
    const asMember = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set(asUser(memberCookie));
    expect(asMember.status).toBe(200);
    expect(asMember.body.data.permissions).toMatchObject({
      canEdit: false,
      canChangeStatus: true,
      canComment: true,
      canDelete: false,
    });

    const asViewer = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set(asUser(viewerCookie));
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.data.permissions.canChangeStatus).toBe(false);

    const asOutsider = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set(asUser(outsiderCookie));
    expect(asOutsider.status).toBe(404);
  });

  it("5. members may change status but not other fields; viewers nothing", async () => {
    const statusChange = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(memberCookie))
      .send({ version: 1, status: "IN_PROGRESS" });
    expect(statusChange.status).toBe(200);
    expect(statusChange.body.data).toMatchObject({ status: "IN_PROGRESS", version: 2 });

    const fieldChange = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(memberCookie))
      .send({ version: 2, title: "Member rename" });
    expect(fieldChange.status).toBe(403);

    const viewerChange = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(viewerCookie))
      .send({ version: 2, status: "DONE" });
    expect(viewerChange.status).toBe(403);
  });

  it("6. the manager can edit any field with the current version", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ version: 2, title: "Design review checklist v2", priority: "URGENT" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      title: "Design review checklist v2",
      priority: "URGENT",
      version: 3,
    });
  });

  it("7. filters by status, priority and search text work", async () => {
    await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Write migration notes", status: "DONE", priority: "LOW" })
      .expect(201);

    const byStatus = await request(app)
      .get(`/api/projects/${projectId}/tasks?status=DONE`)
      .set(asUser(memberCookie));
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.length).toBe(1);
    expect(byStatus.body.data[0].title).toBe("Write migration notes");

    const byPriority = await request(app)
      .get(`/api/projects/${projectId}/tasks?priority=URGENT`)
      .set(asUser(memberCookie));
    expect(byPriority.body.data.length).toBe(1);

    const bySearch = await request(app)
      .get(`/api/projects/${projectId}/tasks?q=migration`)
      .set(asUser(memberCookie));
    expect(bySearch.body.data.length).toBe(1);

    const invalidStatus = await request(app)
      .get(`/api/projects/${projectId}/tasks?status=NOPE`)
      .set(asUser(memberCookie));
    expect(invalidStatus.status).toBe(400);
  });

  it("8. outsiders cannot list project tasks (404)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/tasks`)
      .set(asUser(outsiderCookie));
    expect(res.status).toBe(404);
  });

  it("9. deletion is manager-only", async () => {
    const temp = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Temporary task" });
    expect(temp.status).toBe(201);
    const tempId = temp.body.data.id;

    const memberDelete = await request(app)
      .delete(`/api/tasks/${tempId}`)
      .set(asUser(memberCookie));
    expect(memberDelete.status).toBe(403);

    const pmDelete = await request(app)
      .delete(`/api/tasks/${tempId}`)
      .set(asUser(pmCookie));
    expect(pmDelete.status).toBe(200);

    const gone = await request(app).get(`/api/tasks/${tempId}`).set(asUser(pmCookie));
    expect(gone.status).toBe(404);
  });

  it("10. task payloads never expose credentials", async () => {
    const res = await request(app).get(`/api/tasks/${taskId}`).set(asUser(pmCookie));
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("$argon2");
  });
});
