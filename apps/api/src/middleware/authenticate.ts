import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { asyncHandler } from "../utils/asyncHandler";
import { toSafeUser } from "../utils/userMapper";

const unauthorized = () =>
  new AppError(401, "UNAUTHENTICATED", "Authentication required.");

/**
 * Verifies the auth cookie, loads the current user and rejects
 * missing/invalid/expired tokens and deactivated accounts.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[env.authCookieName] as string | undefined;
  if (!token) return next(unauthorized());

  let sub: string;
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return next(unauthorized());
    }
    sub = payload.sub;
  } catch {
    return next(unauthorized());
  }

  const user = await prisma.user.findUnique({ where: { id: sub } });
  if (!user) {
    console.warn("[auth] token subject not found; rejecting request.");
    return next(unauthorized());
  }
  if (!user.isActive) {
    console.warn("[auth] deactivated account rejected despite valid token.");
    return next(unauthorized());
  }

  req.user = toSafeUser(user);
  next();
});
