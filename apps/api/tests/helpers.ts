import request from "supertest";
import argon2 from "argon2";
import type { SystemRole, User } from "@prisma/client";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";

export const app = createApp();

const createdIds: string[] = [];
const createdProjectIds: string[] = [];
let counter = 0;

export function trackCreated(id: string): void {
  createdIds.push(id);
}

export function trackProject(id: string): void {
  createdProjectIds.push(id);
}

/** Unique, recognisable email for isolated fixtures. */
export function uniqEmail(tag: string): string {
  counter += 1;
  return `itest-${tag}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export interface TestUser {
  user: User;
  password: string;
}

export async function createUser(opts: {
  tag: string;
  role?: SystemRole;
  password?: string;
  isActive?: boolean;
}): Promise<TestUser> {
  const email = uniqEmail(opts.tag);
  const password = opts.password ?? "Test1234!";
  const user = await prisma.user.create({
    data: {
      email,
      name: `Test ${opts.tag}`,
      role: opts.role ?? "TEAM_MEMBER",
      isActive: opts.isActive ?? true,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
  createdIds.push(user.id);
  return { user, password };
}

/** Removes all fixtures created through helpers in this process. */
export async function cleanupCreatedUsers(): Promise<void> {
  if (createdIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
}

/** Removes tracked projects (cascades members, tasks, comments, activity). */
export async function cleanupTrackedProjects(): Promise<void> {
  if (createdProjectIds.length > 0) {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    createdProjectIds.length = 0;
  }
}

/** Direct fixture: project + memberships, tracked for cleanup. */
export async function createProjectFixture(opts: {
  name: string;
  managerId: string;
  members?: { userId: string; role: "MANAGER" | "MEMBER" | "VIEWER" }[];
}): Promise<{ id: string }> {
  const project = await prisma.project.create({
    data: {
      name: opts.name,
      managerId: opts.managerId,
      members: {
        create: [
          { userId: opts.managerId, role: "MANAGER" as const },
          ...(opts.members ?? []),
        ],
      },
    },
  });
  createdProjectIds.push(project.id);
  return { id: project.id };
}

export function extractAuthCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const auth = cookies.find((cookie) => cookie.startsWith(`${env.authCookieName}=`));
  if (!auth) throw new Error("Expected an auth cookie on the login response.");
  return auth.split(";")[0];
}

export async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Expected login to succeed, got ${res.status}.`);
  }
  return extractAuthCookie(res);
}

export function asUser(cookie: string) {
  return { Cookie: cookie };
}
