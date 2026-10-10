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

describe("comments and activity", () => {
  let admin: TestUser;
  let pm: TestUser;
  let member: TestUser;
  let viewer: TestUser;
  let outsider: TestUser;
  let adminCookie: string;
  let pmCookie: string;
  let memberCookie: string;
  let viewerCookie: string;
  let outsiderCookie: string;

  let projectId: string;
  let taskId: string;
  let pmCommentId: string;
  let memberCommentId: string;

  beforeAll(async () => {
    admin = await createUser({ tag: "cmt-admin", role: "ADMIN" });
    pm = await createUser({ tag: "cmt-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "cmt-member", role: "TEAM_MEMBER" });
    viewer = await createUser({ tag: "cmt-viewer", role: "VIEWER" });
    outsider = await createUser({ tag: "cmt-outsider", role: "TEAM_MEMBER" });

    adminCookie = await loginAs(admin.user.email, admin.password);
    pmCookie = await loginAs(pm.user.email, pm.password);
    memberCookie = await loginAs(member.user.email, member.password);
    viewerCookie = await loginAs(viewer.user.email, viewer.password);
    outsiderCookie = await loginAs(outsider.user.email, outsider.password);

    const project = await createProjectFixture({
      name: `Collab ${Date.now()}`,
      managerId: pm.user.id,
      members: [
        { userId: member.user.id, role: "MEMBER" },
        { userId: viewer.user.id, role: "VIEWER" },
      ],
    });
    projectId = project.id;

    const task = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Discussion thread task" });
    taskId = task.body.data.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. members can comment; viewers cannot", async () => {
    const memberComment = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(asUser(memberCookie))
      .send({ content: "Ready for review." });
    expect(memberComment.status).toBe(201);
    expect(memberComment.body.data.author.id).toBe(member.user.id);
    memberCommentId = memberComment.body.data.id;

    const pmComment = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(asUser(pmCookie))
      .send({ content: "Looks good, thanks!" });
    expect(pmComment.status).toBe(201);
    pmCommentId = pmComment.body.data.id;

    const viewerComment = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(asUser(viewerCookie))
      .send({ content: "Viewer should be blocked" });
    expect(viewerComment.status).toBe(403);

    const emptyComment = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(asUser(memberCookie))
      .send({ content: "   " });
    expect(emptyComment.status).toBe(400);
  });

  it("2. the thread is readable by any member, hidden from outsiders", async () => {
    const asViewer = await request(app)
      .get(`/api/tasks/${taskId}/comments`)
      .set(asUser(viewerCookie));
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.data.length).toBe(2);
    expect(asViewer.body.data[0].author).not.toHaveProperty("passwordHash");

    const asOutsider = await request(app)
      .get(`/api/tasks/${taskId}/comments`)
      .set(asUser(outsiderCookie));
    expect(asOutsider.status).toBe(404);
  });

  it("3. comment deletion: author only for members, managers for any", async () => {
    const memberDeletesPms = await request(app)
      .delete(`/api/tasks/${taskId}/comments/${pmCommentId}`)
      .set(asUser(memberCookie));
    expect(memberDeletesPms.status).toBe(403);

    const viewerDeletesOwn = await request(app)
      .delete(`/api/tasks/${taskId}/comments/${memberCommentId}`)
      .set(asUser(viewerCookie));
    expect(viewerDeletesOwn.status).toBe(403);

    const pmDeletesMembers = await request(app)
      .delete(`/api/tasks/${taskId}/comments/${memberCommentId}`)
      .set(asUser(pmCookie));
    expect(pmDeletesMembers.status).toBe(200);

    const missing = await request(app)
      .delete(`/api/tasks/${taskId}/comments/cm00000000000000000000000`)
      .set(asUser(pmCookie));
    expect(missing.status).toBe(404);
  });

  it("4. project activity records real events with actors", async () => {
    // Adds a member through the API so member.added is recorded as well.
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie))
      .send({ userId: outsider.user.id, role: "MEMBER" })
      .expect(201);

    const res = await request(app)
      .get(`/api/projects/${projectId}/activity`)
      .set(asUser(memberCookie));
    expect(res.status).toBe(200);

    const actions = res.body.data.map((row: { action: string }) => row.action);
    expect(actions).toContain("task.created");
    expect(actions).toContain("comment.created");
    expect(actions).toContain("member.added");

    const taskCreated = res.body.data.find(
      (row: { action: string }) => row.action === "task.created",
    );
    expect(taskCreated.actor.id).toBe(pm.user.id);
    expect(taskCreated.summary).toContain("Discussion thread task");
    expect(taskCreated.projectName).toBeTruthy();

    // Remove again so later tests treat them as an outsider.
    const members = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie));
    const row = members.body.data.find((m: { user: { id: string } }) => m.user.id === outsider.user.id);
    await request(app)
      .delete(`/api/projects/${projectId}/members/${row.id}`)
      .set(asUser(pmCookie))
      .expect(200);
  });

  it("5. activity is hidden from outsiders", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/activity`)
      .set(asUser(outsiderCookie));
    expect(res.status).toBe(404);
  });

  it("6. platform-wide activity is admin-only", async () => {
    const asAdmin = await request(app).get("/api/activity").set(asUser(adminCookie));
    expect(asAdmin.status).toBe(200);
    expect(Array.isArray(asAdmin.body.data)).toBe(true);
    expect(asAdmin.body.meta.total).toBeGreaterThan(0);

    const asPm = await request(app).get("/api/activity").set(asUser(pmCookie));
    expect(asPm.status).toBe(403);

    const anon = await request(app).get("/api/activity");
    expect(anon.status).toBe(401);
  });
});
