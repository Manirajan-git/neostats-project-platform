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

describe("notifications", () => {
  let pm: TestUser;
  let assignee: TestUser;
  let pmCookie: string;
  let assigneeCookie: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    pm = await createUser({ tag: "notif-pm", role: "PROJECT_MANAGER" });
    assignee = await createUser({ tag: "notif-assignee", role: "TEAM_MEMBER" });
    pmCookie = await loginAs(pm.user.email, pm.password);
    assigneeCookie = await loginAs(assignee.user.email, assignee.password);

    const project = await createProjectFixture({
      name: `Notify ${Date.now()}`,
      managerId: pm.user.id,
      members: [{ userId: assignee.user.id, role: "MEMBER" }],
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. assigning a task notifies the assignee, never the actor", async () => {
    const created = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Notify me task", assigneeId: assignee.user.id });
    expect(created.status).toBe(201);
    taskId = created.body.data.id;

    const forAssignee = await request(app)
      .get("/api/notifications")
      .set(asUser(assigneeCookie));
    expect(forAssignee.status).toBe(200);
    expect(forAssignee.body.unreadCount).toBeGreaterThan(0);
    const assigned = forAssignee.body.data.find(
      (n: { type: string }) => n.type === "TASK_ASSIGNED",
    );
    expect(assigned).toBeTruthy();
    expect(assigned.message).toContain("Notify me task");
    expect(assigned.read).toBe(false);

    const forActor = await request(app)
      .get("/api/notifications")
      .set(asUser(pmCookie));
    const actorAssigned = forActor.body.data.filter(
      (n: { type: string }) => n.type === "TASK_ASSIGNED",
    );
    expect(actorAssigned.length).toBe(0);
  });

  it("2. a status change notifies the assignee with a distinct type", async () => {
    const task = await request(app).get(`/api/tasks/${taskId}`).set(asUser(pmCookie));
    const version = task.body.data.version;

    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ version, status: "IN_PROGRESS" });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set(asUser(assigneeCookie));
    const statusChanged = list.body.data.find(
      (n: { type: string }) => n.type === "TASK_STATUS_CHANGED",
    );
    expect(statusChanged).toBeTruthy();
    expect(statusChanged.read).toBe(false);
  });

  it("3. mark-read updates state and unread count accurately", async () => {
    const before = await request(app)
      .get("/api/notifications/unread-count")
      .set(asUser(assigneeCookie));
    expect(before.body.unreadCount).toBeGreaterThan(0);

    const list = await request(app)
      .get("/api/notifications?unreadOnly=true")
      .set(asUser(assigneeCookie));
    const first = list.body.data[0];

    const mark = await request(app)
      .patch(`/api/notifications/${first.id}/read`)
      .set(asUser(assigneeCookie));
    expect(mark.status).toBe(200);
    expect(mark.body.data.read).toBe(true);

    const after = await request(app)
      .get("/api/notifications/unread-count")
      .set(asUser(assigneeCookie));
    expect(after.body.unreadCount).toBe(before.body.unreadCount - 1);
  });

  it("4. users cannot read or mark other users' notifications (404)", async () => {
    const list = await request(app)
      .get("/api/notifications")
      .set(asUser(assigneeCookie));
    const theirs = list.body.data[0];

    const res = await request(app)
      .patch(`/api/notifications/${theirs.id}/read`)
      .set(asUser(pmCookie));
    expect(res.status).toBe(404);
  });

  it("5. mark-all-read clears the caller's unread count", async () => {
    const res = await request(app)
      .post("/api/notifications/read-all")
      .set(asUser(assigneeCookie));
    expect(res.status).toBe(200);

    const count = await request(app)
      .get("/api/notifications/unread-count")
      .set(asUser(assigneeCookie));
    expect(count.body.unreadCount).toBe(0);
  });

  it("6. comments on an assigned task notify the assignee", async () => {
    const comment = await request(app)
      .post(`/api/tasks/${taskId}/comments`)
      .set(asUser(pmCookie))
      .send({ content: "Any update on this?" });
    expect(comment.status).toBe(201);

    const list = await request(app)
      .get("/api/notifications")
      .set(asUser(assigneeCookie));
    const commentNotif = list.body.data.find(
      (n: { type: string }) => n.type === "COMMENT_ADDED",
    );
    expect(commentNotif).toBeTruthy();
    expect(commentNotif.message).toContain("commented on");
    expect(commentNotif.message).toContain("Notify me task");
    expect(commentNotif.entityId).toBe(taskId);
  });

  it("7. anonymous requests are rejected with 401", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });
});
