import type { RequestHandler } from "express";
import type { SystemRole } from "@prisma/client";
import { AppError } from "../utils/errors";

/**
 * Role gate. Must run after `authenticate`.
 * 401 if the caller is unknown, 403 if the role is insufficient.
 */
export function authorizeRoles(...roles: SystemRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "UNAUTHENTICATED", "Authentication required."));
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."),
      );
    }
    next();
  };
}
