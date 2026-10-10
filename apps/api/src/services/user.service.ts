import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { SAFE_USER_SELECT, toSafeUser } from "../utils/userMapper";
import { hashPassword, normalizeEmail } from "./auth.service";
import type { CreateUserInput, PaginationInput, UpdateUserInput } from "../schemas/user.schema";
import type { PaginationMeta, SafeUser } from "../types/dto";

export async function listUsers(query: PaginationInput): Promise<{
  data: SafeUser[];
  meta: PaginationMeta;
}> {
  const where = query.q
    ? {
        OR: [
          { email: { contains: query.q, mode: "insensitive" as const } },
          { name: { contains: query.q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: SAFE_USER_SELECT,
    }),
  ]);

  return {
    data: rows,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getUser(id: string): Promise<SafeUser> {
  const user = await prisma.user.findUnique({ where: { id }, select: SAFE_USER_SELECT });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  return user;
}

export async function createUser(input: CreateUserInput): Promise<SafeUser> {
  const email = normalizeEmail(input.email);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "DUPLICATE_EMAIL", "An account with this email already exists.");
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: true,
    },
    select: SAFE_USER_SELECT,
  });
  return user;
}

async function assertNotLastActiveAdmin(targetId: string): Promise<void> {
  const otherAdmins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: targetId } },
  });
  if (otherAdmins === 0) {
    throw new AppError(
      409,
      "LAST_ADMIN",
      "At least one active administrator must remain.",
    );
  }
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<SafeUser> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");

  if (input.role !== undefined && target.role === "ADMIN" && input.role !== "ADMIN") {
    await assertNotLastActiveAdmin(id);
  }

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    const clash = await prisma.user.findUnique({ where: { email } });
    if (clash && clash.id !== id) {
      throw new AppError(409, "DUPLICATE_EMAIL", "An account with this email already exists.");
    }
  }

  const data: { name?: string; email?: string; role?: User["role"]; passwordHash?: string } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) data.email = normalizeEmail(input.email);
  if (input.role !== undefined) data.role = input.role;
  if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);

  const updated = await prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT });
  return updated;
}

export async function deactivateUser(id: string, actorId: string): Promise<SafeUser> {
  if (id === actorId) {
    throw new AppError(
      400,
      "CANNOT_DEACTIVATE_SELF",
      "You cannot deactivate your own account.",
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (!target.isActive) {
    throw new AppError(409, "ALREADY_DEACTIVATED", "This account is already deactivated.");
  }

  if (target.role === "ADMIN") {
    await assertNotLastActiveAdmin(id);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: SAFE_USER_SELECT,
  });
  return updated;
}

export async function activateUser(id: string): Promise<SafeUser> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  if (target.isActive) {
    throw new AppError(409, "ALREADY_ACTIVE", "This account is already active.");
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: true },
    select: SAFE_USER_SELECT,
  });
  return updated;
}

/**
 * Minimal people directory (id, name, email, role) for project managers to
 * pick members. Returns active users only and never any credential material.
 */
export async function listDirectory(q?: string): Promise<
  Pick<SafeUser, "id" | "name" | "email" | "role">[]
> {
  const where = {
    isActive: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  return prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
    take: 100,
  });
}
