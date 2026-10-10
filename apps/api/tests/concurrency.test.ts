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

describe("task optimistic concurrency (HTTP 409)", () => {
  let pm: TestUser;
  let member: TestUser;
  let pmCookie: string;
  let memberCookie: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    pm = await createUser({ tag: "conc-pm", role: "PROJECT_MANAGER" });
    member = await createUser({ tag: "conc-member", role: "TEAM_MEMBER" });
    pmCookie = await loginAs(pm.user.email, pm.password);
    memberCookie = await loginAs(member.user.email, member.password);

    const project = await createProjectFixture({
      name: `Concurrency ${Date.now()}`,
      managerId: pm.user.id,
      members: [{ userId: member.user.id, role: "MEMBER" }],
    });
    projectId = project.id;

    const created = await request(app)
      .post(`/api/projects/${projectId}/tasks`)
      .set(asUser(pmCookie))
      .send({ title: "Contended task", description: "Original description" });
    taskId = created.body.data.id;
  });

  afterAll(async () => {
    await cleanupTrackedProjects();
    await cleanupCreatedUsers();
  });

  it("1. a fresh task starts at version 1", async () => {
    const res = await request(app).get(`/api/tasks/${taskId}`).set(asUser(pmCookie));
    expect(res.body.data.version).toBe(1);
  });

  it("2. the first update with the expected version succeeds and increments it", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ version: 1, title: "First writer wins" });

    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.title).toBe("First writer wins");
  });

  it("3. a stale update returns 409 with the current task and does not overwrite", async () => {
    // A manager writes titles, so the version guard (not the field gate) decides.
    const stale = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ version: 1, title: "Second writer is stale" });

    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("TASK_VERSION_CONFLICT");
    expect(stale.body.error.meta.task.version).toBe(2);
    expect(stale.body.error.meta.task.title).toBe("First writer wins");

    const current = await request(app).get(`/api/tasks/${taskId}`).set(asUser(pmCookie));
    expect(current.body.data.title).toBe("First writer wins");
    expect(current.body.data.version).toBe(2);
  });

  it("4. retrying with the refreshed version succeeds", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(memberCookie))
      .send({ version: 2, status: "BLOCKED" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "BLOCKED", version: 3 });
  });

  it("5. concurrent-style parallel updates: exactly one wins", async () => {
    const [a, b] = await Promise.all([
      request(app)
        .patch(`/api/tasks/${taskId}`)
        .set(asUser(pmCookie))
        .send({ version: 3, title: "Parallel A" }),
      request(app)
        .patch(`/api/tasks/${taskId}`)
        .set(asUser(pmCookie))
        .send({ version: 3, title: "Parallel B" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const current = await request(app).get(`/api/tasks/${taskId}`).set(asUser(pmCookie));
    expect(current.body.data.version).toBe(4);
    const winner = a.status === 200 ? "Parallel A" : "Parallel B";
    expect(current.body.data.title).toBe(winner);
  });

  it("6. missing or malformed version returns 400", async () => {
    const missing = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ title: "No version provided" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const malformed = await request(app)
      .patch(`/api/tasks/${taskId}`)
      .set(asUser(pmCookie))
      .send({ version: "not-a-number", title: "Bad version" });
    expect(malformed.status).toBe(400);
  });
});
