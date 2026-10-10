import type { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originFromReferer(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF defence-in-depth for cookie-authenticated state-changing requests:
 * rejects browser requests whose Origin/Referer is not in the trusted allowlist.
 * Requests without Origin/Referer (curl, tests, native clients) are allowed -
 * they cannot carry ambient browser cookies from a third-party site.
 * Combined with SameSite=Lax cookies and the CORS allowlist.
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin ?? originFromReferer(req.headers.referer);
  if (!origin) return next();

  if (env.trustedOrigins.includes(origin)) return next();

  next(new AppError(403, "ORIGIN_NOT_ALLOWED", "Request origin is not allowed."));
};
