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

describe("project membership", () => {
  let admin: TestUser;
  let pm: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let inactive: TestUser;
  let adminCookie: string;
  let pmCookie: string;
  let memberCookie: string;
  let outsiderCookie: string;

  let projectId: string;
  let memberRowId: string;

  beforeAll(async () => {
    admin = await createUser({ tag: "mem-admin", role: "ADMIN" });
    pm = await createUser({ tag: "mem-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "mem-member", role: "TEAM_MEMBER" });
    outsider = await createUser({ tag: "mem-outsider", role: "TEAM_MEMBER" });
    inactive = await createUser({ tag: "mem-inactive", role: "TEAM_MEMBER", isActive: false });

    adminCookie = await loginAs(admin.user.email, admin.password);
    pmCookie = await loginAs(pm.user.email, pm.password);
    memberCookie = await loginAs(member.user.email, member.password);
    outsiderCookie = await loginAs(outsider.user.email, outsider.password);

    const project = await createProjectFixture({
      name: `Membership ${Date.now()}`,
      managerId: pm.user.id,
      members: [{ userId: member.user.id, role: "MEMBER" }],
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. admins and the project manager can list members", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const owner = res.body.data.find((m: { isOwner: boolean }) => m.isOwner);
    expect(owner.user.id).toBe(pm.user.id);

    const adminRes = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(asUser(adminCookie));
    expect(adminRes.status).toBe(200);
  });

  it("2. non-members cannot see the member list (404)", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(asUser(outsiderCookie));
    expect(res.status).toBe(404);
  });

  it("3. manager adds a member; duplicates return 409", async () => {
    const add = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie))
      .send({ userId: outsider.user.id, role: "MEMBER" });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ role: "MEMBER" });
    expect(add.body.data.user.id).toBe(outsider.user.id);
    expect(add.body.data.user).not.toHaveProperty("passwordHash");
    memberRowId = add.body.data.id;

    const dup = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie))
      .send({ userId: outsider.user.id, role: "VIEWER" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE");
  });

  it("4. a regular member cannot add or remove members", async () => {
    const add = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(memberCookie))
      .send({ userId: admin.user.id, role: "MEMBER" });
    expect(add.status).toBe(403);

    const remove = await request(app)
      .delete(`/api/projects/${projectId}/members/${memberRowId}`)
      .set(asUser(memberCookie));
    expect(remove.status).toBe(403);
  });

  it("5. adding a deactivated user is rejected with 400", async () => {
    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie))
      .send({ userId: inactive.user.id, role: "MEMBER" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("USER_INACTIVE");
  });

  it("6. role changes and removal work for managers", async () => {
    const change = await request(app)
      .patch(`/api/projects/${projectId}/members/${memberRowId}`)
      .set(asUser(pmCookie))
      .send({ role: "VIEWER" });
    expect(change.status).toBe(200);
    expect(change.body.data.role).toBe("VIEWER");

    const remove = await request(app)
      .delete(`/api/projects/${projectId}/members/${memberRowId}`)
      .set(asUser(pmCookie));
    expect(remove.status).toBe(200);

    const removeAgain = await request(app)
      .delete(`/api/projects/${projectId}/members/${memberRowId}`)
      .set(asUser(pmCookie));
    expect(removeAgain.status).toBe(404);
  });

  it("7. the project owner cannot be removed as a member", async () => {
    const list = await request(app)
      .get(`/api/projects/${projectId}/members`)
      .set(asUser(pmCookie));
    const ownerRow = list.body.data.find((m: { isOwner: boolean }) => m.isOwner);

    const res = await request(app)
      .delete(`/api/projects/${projectId}/members/${ownerRow.id}`)
      .set(asUser(adminCookie));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OWNER_CANNOT_BE_REMOVED");
  });

  it("8. unknown member ids return 404", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectId}/members/cm00000000000000000000000`)
      .set(asUser(pmCookie))
      .send({ role: "MEMBER" });
    expect(res.status).toBe(404);
  });
});
