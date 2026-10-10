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

describe("dashboard summary", () => {
  let admin: TestUser;
  let member: TestUser;
  let adminCookie: string;
  let memberCookie: string;
  let projectId: string;

  beforeAll(async () => {
    admin = await createUser({ tag: "dash-admin", role: "ADMIN" });
    member = await createUser({ tag: "dash-member", role: "TEAM_MEMBER" });
    adminCookie = await loginAs(admin.user.email, admin.password);
    memberCookie = await loginAs(member.user.email, member.password);

    const project = await createProjectFixture({
      name: `Dashboard ${Date.now()}`,
      managerId: admin.user.id,
      members: [{ userId: member.user.id, role: "MEMBER" }],
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. anonymous requests get 401", async () => {
    const res = await request(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });

  it("2. admins see platform-scoped totals with real structure", async () => {
    const res = await request(app).get("/api/dashboard").set(asUser(adminCookie));
    expect(res.status).toBe(200);

    const { projects, tasks, upcomingDeadlines, recentActivity, unreadNotifications } =
      res.body.data;
    expect(projects.total).toBeGreaterThanOrEqual(1);
    expect(projects.active).toBeGreaterThanOrEqual(1);
    expect(typeof projects.managed).toBe("number");
    expect(typeof tasks.byStatus.TODO).toBe("number");
    expect(tasks.total).toBe(
      tasks.byStatus.TODO +
        tasks.byStatus.IN_PROGRESS +
        tasks.byStatus.BLOCKED +
        tasks.byStatus.DONE,
    );
    expect(Array.isArray(upcomingDeadlines)).toBe(true);
    expect(Array.isArray(recentActivity)).toBe(true);
    expect(typeof unreadNotifications).toBe("number");
  });

  it("3. team members see their scoped projects and assignments", async () => {
    // A task assigned to the member by the admin.
    const created = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(adminCookie))
      .send({
        title: "Dashboard task",
        assigneeId: member.user.id,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });
    expect(created.status).toBe(201);

    const res = await request(app).get("/api/dashboard").set(asUser(memberCookie));
    expect(res.status).toBe(200);

    const { projects, tasks, upcomingDeadlines, recentActivity } = res.body.data;
    expect(projects.total).toBeGreaterThanOrEqual(1);
    expect(projects.managed).toBe(0);
    expect(tasks.assignedToMe.total).toBeGreaterThanOrEqual(1);
    expect(tasks.assignedToMe.dueSoon).toBeGreaterThanOrEqual(1);
    expect(upcomingDeadlines.some((t: { title: string }) => t.title === "Dashboard task")).toBe(
      true,
    );
    expect(recentActivity.length).toBeGreaterThan(0);
    expect(recentActivity[0].summary).toBeTruthy();
  });

  it("4. dashboard payloads never contain credentials", async () => {
    const res = await request(app).get("/api/dashboard").set(asUser(adminCookie));
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("$argon2");
  });
});
