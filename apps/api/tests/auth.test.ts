import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env";
import {
  app,
  asUser,
  cleanupCreatedUsers,
  createUser,
  extractAuthCookie,
  loginAs,
  type TestUser,
} from "./helpers";

describe("authentication", () => {
  let active: TestUser;
  let inactive: TestUser;

  beforeAll(async () => {
    active = await createUser({ tag: "auth-active", role: "TEAM_MEMBER" });
    inactive = await createUser({ tag: "auth-inactive", role: "TEAM_MEMBER", isActive: false });
  });

  afterAll(async () => {
    await cleanupCreatedUsers();
  });

  it("1. accepts valid credentials, sets a secure cookie, never returns passwordHash", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: active.user.email, password: active.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: active.user.id,
      email: active.user.email,
      role: "TEAM_MEMBER",
      isActive: true,
    });
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(res.body)).not.toContain("$argon2");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const cookie = extractAuthCookie(res);
    expect(cookie.startsWith(`${env.authCookieName}=`)).toBe(true);

    const setCookie = res.headers["set-cookie"];
    const raw = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(raw).toContain("HttpOnly");
    expect(raw).toContain("SameSite=Lax");
    expect(raw).toContain("Path=/");
  });

  it("2. rejects an incorrect password with a generic 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: active.user.email, password: "WrongPassword1" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("3. unknown email fails with the exact same message as a wrong password", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: active.user.email, password: "WrongPassword1" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "definitely-not-registered@example.com", password: "Whatever123" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it("4. invalid request data is rejected with 400 VALIDATION_ERROR", async () => {
    const missing = await request(app).post("/api/auth/login").send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(missing.body.error.details)).toBe(true);

    const malformed = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email", password: "" });
    expect(malformed.status).toBe(400);
  });

  it("5. inactive user cannot log in (correct password, disabled account)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: inactive.user.email, password: inactive.password });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("6. missing authentication is rejected by protected endpoints", async () => {
    const me = await request(app).get("/api/auth/me");
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");

    const users = await request(app).get("/api/users");
    expect(users.status).toBe(401);
  });

  it("7. invalid/garbage cookie is rejected", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `${env.authCookieName}=this-is-not-a-jwt`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("8. expired token is rejected", async () => {
    const expired = jwt.sign({ sub: active.user.id }, env.jwtSecret, {
      algorithm: "HS256",
      expiresIn: -60,
    });
    const res = await request(app).get("/api/auth/me").set(asUser(`${env.authCookieName}=${expired}`));
    expect(res.status).toBe(401);
  });

  it("9. logout clears the auth cookie", async () => {
    const cookie = await loginAs(active.user.email, active.password);
    const res = await request(app).post("/api/auth/logout").set(asUser(cookie));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const raw = res.headers["set-cookie"];
    const joined = Array.isArray(raw) ? raw.join(";") : String(raw);
    expect(joined).toContain(`${env.authCookieName}=`);
    expect(/Expires=Thu, 01 Jan 1970/i.test(joined) || /Max-Age=0/i.test(joined)).toBe(true);
    expect(joined).toContain("HttpOnly");
  });

  it("10. password hashes never appear in auth responses", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: active.user.email, password: active.password });
    const cookie = extractAuthCookie(login);
    const me = await request(app).get("/api/auth/me").set(asUser(cookie));

    for (const body of [login.body, me.body]) {
      const json = JSON.stringify(body);
      expect(json).not.toContain("passwordHash");
      expect(json).not.toContain("$argon2");
      expect(json).not.toContain(active.password);
    }
  });
});
