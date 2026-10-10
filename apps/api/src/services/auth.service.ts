import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { User } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";

const INVALID_CREDENTIALS = "Invalid email or password.";

/** Used to equalise response timing when the email does not exist. */
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash(crypto.randomBytes(24).toString("hex"), {
    type: argon2.argon2id,
  });
  return dummyHash;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed/empty stored hash (e.g. migration sentinel) can never verify.
    return false;
  }
}

/** Validates credentials and returns the authenticated user. Throws AppError. */
export async function login(email: string, password: string): Promise<User> {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });

  if (!user || !user.passwordHash) {
    await verifyPassword(await getDummyHash(), password).catch(() => false);
    throw new AppError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    throw new AppError(401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
  }

  if (!user.isActive) {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated.");
  }

  return user;
}

/** Minimal signed payload - no personal data in the token. */
export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    path: "/",
    maxAge: env.cookieMaxAgeMs,
  };
}

/** Options for clearing the cookie - must mirror the attributes used when setting it. */
export function clearCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.isProd,
    path: "/",
  };
}
