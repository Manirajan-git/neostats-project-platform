import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import {
  app,
  asUser,
  cleanupCreatedUsers,
  createUser,
  loginAs,
  type TestUser,
} from "./helpers";

describe("authorization (server-side role gates)", () => {
  let admin: TestUser;
  let manager: TestUser;
  let member: TestUser;
  let viewer: TestUser;

  beforeAll(async () => {
    admin = await createUser({ tag: "authz-admin", role: "ADMIN" });
    manager = await createUser({ tag: "authz-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "authz-member", role: "TEAM_MEMBER" });
    viewer = await createUser({ tag: "authz-viewer", role: "VIEWER" });
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
  });

  it("1. anonymous user cannot access user management (401)", async () => {
    const list = await request(app).get("/api/users");
    expect(list.status).toBe(401);
    expect(list.body.error.code).toBe("UNAUTHENTICATED");

    const create = await request(app)
      .post("/api/users")
      .send({ name: "X", email: "x@example.com", password: "Password1", role: "VIEWER" });
    expect(create.status).toBe(401);
  });

  it("2-4. Team Member, Viewer and Project Manager all get 403", async () => {
    for (const account of [member, viewer, manager]) {
      const cookie = await loginAs(account.user.email, account.password);
      const res = await request(app).get("/api/users").set(asUser(cookie));
      expect(res.status, `role ${account.user.role} must be forbidden`).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
  });

  it("5. active Admin can access user management", async () => {
    const cookie = await loginAs(admin.user.email, admin.password);
    const res = await request(app).get("/api/users").set(asUser(cookie));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  it("6. deactivated user loses access with a previously issued token", async () => {
    const tempAdmin = await createUser({ tag: "authz-temp-admin", role: "ADMIN" });
    const cookie = await loginAs(tempAdmin.user.email, tempAdmin.password);

    // Works while active.
    const before = await request(app).get("/api/auth/me").set(asUser(cookie));
    expect(before.status).toBe(200);

    // Deactivate behind the scenes (simulates an admin deactivating this account).
    await prisma.user.update({ where: { id: tempAdmin.user.id }, data: { isActive: false } });

    const after = await request(app).get("/api/auth/me").set(asUser(cookie));
    expect(after.status).toBe(401);

    const users = await request(app).get("/api/users").set(asUser(cookie));
    expect(users.status).toBe(401);
  });

  it("7. arbitrary fields cannot escalate privileges; non-admins cannot reach the endpoint", async () => {
    // Non-admin PATCH is rejected before any field is considered.
    const memberCookie = await loginAs(member.user.email, member.password);
    const forbidden = await request(app)
      .patch(`/api/users/${member.user.id}`)
      .set(asUser(memberCookie))
      .send({ role: "ADMIN" });
    expect(forbidden.status).toBe(403);

    // Admin PATCH with internal fields is rejected by the strict schema.
    const adminCookie = await loginAs(admin.user.email, admin.password);
    const escalation = await request(app)
      .patch(`/api/users/${member.user.id}`)
      .set(asUser(adminCookie))
      .send({ isActive: true, passwordHash: "$argon2id$evil" });
    expect(escalation.status).toBe(400);
    expect(escalation.body.error.code).toBe("VALIDATION_ERROR");

    // Target is unchanged.
    const refreshed = await prisma.user.findUnique({ where: { id: member.user.id } });
    expect(refreshed?.role).toBe("TEAM_MEMBER");
    expect(refreshed?.passwordHash).not.toContain("evil");
  });
});
