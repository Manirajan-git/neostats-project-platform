import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  app,
  asUser,
  cleanupCreatedUsers,
  cleanupTrackedProjects,
  createUser,
  loginAs,
  trackProject,
  type TestUser,
} from "./helpers";

describe("projects (CRUD + authorization)", () => {
  let admin: TestUser;
  let pm: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let adminCookie: string;
  let pmCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;

  const projectName = `Apollo Platform ${Date.now()}`;
  let projectId: string;

  beforeAll(async () => {
    admin = await createUser({ tag: "proj-admin", role: "ADMIN" });
    pm = await createUser({ tag: "proj-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "proj-member", role: "TEAM_MEMBER" });
    outsider = await createUser({ tag: "proj-outsider", role: "TEAM_MEMBER" });

    adminCookie = await loginAs(admin.user.email, admin.password);
    pmCookie = await loginAs(pm.user.email, pm.password);
    memberCookie = await loginAs(member.user.email, member.password);
    outsiderCookie = await loginAs(outsider.user.email, outsider.password);
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. admin can create a project; response includes task counts and manager", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(asUser(adminCookie))
      .send({ name: projectName, description: "Phase 3 fixture", managerId: pm.user.id });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: projectName,
      status: "ACTIVE",
      myRole: "MANAGER",
      taskCounts: { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0, total: 0 },
    });
    expect(res.body.data.manager.id).toBe(pm.user.id);
    projectId = res.body.data.id;
    trackProject(projectId);
  });

  it("2. non-admin project managers cannot create projects", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(asUser(pmCookie))
      .send({ name: "Should not exist" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("3. creating with an empty name returns 400 with field details", async () => {
    const res = await request(app)
      .post("/api/projects")
      .set(asUser(adminCookie))
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details?.length).toBeGreaterThan(0);
  });

  it("4. members can read the project, outsiders get 404 (existence hidden)", async () => {
    await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie))
      .send({ userId: member.user.id, role: "MEMBER" })
      .expect(201);

    const asMember = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(asUser(memberCookie));
    expect(asMember.status).toBe(200);
    expect(asMember.body.data.permissions.canManage).toBe(false);

    const asOutsider = await request(app)
      .get(`/api/projects/${projectId}`)
      .set(asUser(outsiderCookie));
    expect(asOutsider.status).toBe(404);
    expect(asOutsider.body.error.code).toBe("PROJECT_NOT_FOUND");

    const anon = await request(app).get(`/api/projects/${projectId}`);
    expect(anon.status).toBe(401);
  });

  it("5. list is scoped: admin and members see it, outsiders do not", async () => {
    const adminList = await request(app).get("/api/projects").set(asUser(adminCookie));
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);

    const memberList = await request(app).get("/api/projects").set(asUser(memberCookie));
    expect(memberList.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);

    const outsiderList = await request(app).get("/api/projects").set(asUser(outsiderCookie));
    expect(outsiderList.body.data.some((p: { id: string }) => p.id === projectId)).toBe(false);

    const search = await request(app)
      .get(`/api/projects?q=Apollo`)
      .set(asUser(adminCookie));
    expect(search.body.data.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("6. the assigned manager can update; regular members get 403", async () => {
    const pmUpdate = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(pmCookie))
      .send({ name: `${projectName} v2`, description: "Updated by PM" });
    expect(pmUpdate.status).toBe(200);
    expect(pmUpdate.body.data.name).toBe(`${projectName} v2`);

    const memberUpdate = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(memberCookie))
      .send({ name: "Member rename" });
    expect(memberUpdate.status).toBe(403);
  });

  it("7. archiving works and the archived status is returned", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(pmCookie))
      .send({ status: "ARCHIVED" });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ARCHIVED");

    // Restore for later assertions.
    await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(pmCookie))
      .send({ status: "ACTIVE" })
      .expect(200);
  });

  it("8. only admins can reassign the project manager", async () => {
    const pmTry = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(pmCookie))
      .send({ managerId: member.user.id });
    expect(pmTry.status).toBe(403);

    const adminReassign = await request(app)
      .patch(`/api/projects/${projectId}`)
      .set(asUser(adminCookie))
      .send({ managerId: pm.user.id });
    expect(adminReassign.status).toBe(200);
    expect(adminReassign.body.data.manager.id).toBe(pm.user.id);
  });

  it("9. invalid project ids return 400, missing projects 404", async () => {
    const badId = await request(app)
      .get("/api/projects/not-a-cuid")
      .set(asUser(adminCookie));
    expect(badId.status).toBe(400);

    const missing = await request(app)
      .get("/api/projects/cm00000000000000000000000")
      .set(asUser(adminCookie));
    expect(missing.status).toBe(404);
  });

  it("10. platform-wide list contains no password material", async () => {
    const res = await request(app).get("/api/projects").set(asUser(adminCookie));
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("$argon2");
  });
});
