import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/lib/prisma";
import { runSeed } from "../prisma/seed";
import {
  app,
  asUser,
  cleanupCreatedUsers,
  createUser,
  loginAs,
  trackCreated,
  uniqEmail,
  type TestUser,
} from "./helpers";

const SEED_EMAILS = [
  "admin@neostats.dev",
  "manager@neostats.dev",
  "member@neostats.dev",
  "viewer@neostats.dev",
];

describe("admin user management", () => {
  let admin: TestUser;
  let member: TestUser;
  let adminCookie: string;

  beforeAll(async () => {
    admin = await createUser({ tag: "users-admin", role: "ADMIN" });
    member = await createUser({ tag: "users-member", role: "TEAM_MEMBER" });
    adminCookie = await loginAs(admin.user.email, admin.password);
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
  });

  it("1. admin creates a user; response is safe and the account can log in", async () => {
    const email = uniqEmail("created");
    const res = await request(app)
      .post("/api/users")
      .set(asUser(adminCookie))
      .send({ name: "Created User", email, password: "Created123", role: "VIEWER" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email, name: "Created User", role: "VIEWER", isActive: true });
    expect(res.body.data).not.toHaveProperty("passwordHash");
    trackCreated(res.body.data.id);

    const login = await request(app).post("/api/auth/login").send({ email, password: "Created123" });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("VIEWER");
  });

  it("2. duplicate email is rejected with 409", async () => {
    const email = uniqEmail("dup");
    const first = await request(app)
      .post("/api/users")
      .set(asUser(adminCookie))
      .send({ name: "First", email, password: "Duplicate123", role: "TEAM_MEMBER" });
    expect(first.status).toBe(201);
    trackCreated(first.body.data.id);

    const second = await request(app)
      .post("/api/users")
      .set(asUser(adminCookie))
      .send({ name: "Second", email, password: "Duplicate123", role: "TEAM_MEMBER" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_EMAIL");
    expect(JSON.stringify(second.body)).not.toMatch(/pg_|relation|sql/i);
  });

  it("3. invalid role is rejected", async () => {
    const res = await request(app)
      .post("/api/users")
      .set(asUser(adminCookie))
      .send({ name: "Bad Role", email: uniqEmail("badrole"), password: "Whatever123", role: "SUPERUSER" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("4. invalid pagination is rejected", async () => {
    for (const query of ["page=0", "limit=1000", "page=abc", "limit=0"]) {
      const res = await request(app).get(`/api/users?${query}`).set(asUser(adminCookie));
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("5. non-admin user creation is rejected", async () => {
    const memberCookie = await loginAs(member.user.email, member.password);
    const res = await request(app)
      .post("/api/users")
      .set(asUser(memberCookie))
      .send({ name: "Nope", email: uniqEmail("nope"), password: "Whatever123", role: "ADMIN" });
    expect(res.status).toBe(403);
  });

  it("6. list and detail responses exclude password hashes", async () => {
    const list = await request(app).get("/api/users?limit=50").set(asUser(adminCookie));
    expect(list.status).toBe(200);
    expect(list.body.meta.total).toBeGreaterThan(0);
    const listJson = JSON.stringify(list.body);
    expect(listJson).not.toContain("passwordHash");
    expect(listJson).not.toContain("$argon2");

    const detail = await request(app)
      .get(`/api/users/${admin.user.id}`)
      .set(asUser(adminCookie));
    expect(detail.status).toBe(200);
    expect(detail.body.data).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(detail.body)).not.toContain("$argon2");
  });

  it("7. updates respect the permitted-field allowlist", async () => {
    const target = await createUser({ tag: "upd-target", role: "VIEWER" });

    const renamed = await request(app)
      .patch(`/api/users/${target.user.id}`)
      .set(asUser(adminCookie))
      .send({ name: "Renamed Person" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe("Renamed Person");

    const unknownField = await request(app)
      .patch(`/api/users/${target.user.id}`)
      .set(asUser(adminCookie))
      .send({ passwordHash: "$argon2id$hacked" });
    expect(unknownField.status).toBe(400);

    const stillOriginal = await prisma.user.findUnique({ where: { id: target.user.id } });
    expect(stillOriginal?.name).toBe("Renamed Person");
    expect(stillOriginal?.passwordHash).not.toContain("hacked");
  });

  it("8. deactivation changes account status and blocks login", async () => {
    const victim = await createUser({ tag: "deact-victim", role: "TEAM_MEMBER" });

    const res = await request(app)
      .patch(`/api/users/${victim.user.id}/deactivate`)
      .set(asUser(adminCookie));
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: victim.user.email, password: victim.password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DISABLED");

    // Never a physical delete.
    const stillThere = await prisma.user.findUnique({ where: { id: victim.user.id } });
    expect(stillThere).not.toBeNull();

    // Double deactivation is rejected.
    const again = await request(app)
      .patch(`/api/users/${victim.user.id}/deactivate`)
      .set(asUser(adminCookie));
    expect(again.status).toBe(409);

    // Self-deactivation is blocked.
    const self = await request(app)
      .patch(`/api/users/${admin.user.id}/deactivate`)
      .set(asUser(adminCookie));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_DEACTIVATE_SELF");
  });

  it("9. unknown and malformed user ids return appropriate errors", async () => {
    const missing = await request(app)
      .get("/api/users/caaaaaaaaaaaaaaaaaaaaaaa")
      .set(asUser(adminCookie));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("USER_NOT_FOUND");

    const malformed = await request(app)
      .get("/api/users/not-a-valid-id")
      .set(asUser(adminCookie));
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");

    const deactivateMissing = await request(app)
      .patch("/api/users/caaaaaaaaaaaaaaaaaaaaaaa/deactivate")
      .set(asUser(adminCookie));
    expect(deactivateMissing.status).toBe(404);
  });

  it("10. seed script is idempotent: no duplicates, no password resets", async () => {
    const first = await runSeed();
    const hashesBefore = await prisma.user.findMany({
      where: { email: { in: SEED_EMAILS } },
      select: { email: true, passwordHash: true },
    });
    expect(hashesBefore).toHaveLength(4);

    const second = await runSeed();
    expect(second.created).toHaveLength(0);

    const hashesAfter = await prisma.user.findMany({
      where: { email: { in: SEED_EMAILS } },
      select: { email: true, passwordHash: true },
    });
    expect(hashesAfter).toHaveLength(4);
    expect(hashesAfter.map((u) => u.passwordHash).sort()).toEqual(
      hashesBefore.map((u) => u.passwordHash).sort(),
    );
    // First run either created them or found them; both must leave exactly 4.
    expect(first.created.length + first.skipped.length).toBe(4);

    const countAll = await prisma.user.count({
      where: { email: { in: SEED_EMAILS } },
    });
    expect(countAll).toBe(4);
  });
});
