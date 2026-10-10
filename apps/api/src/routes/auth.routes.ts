import { Router } from "express";
import { env } from "../config/env";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { loginSchema } from "../schemas/auth.schema";
import {
  authCookieOptions,
  clearCookieOptions,
  issueToken,
  login,
} from "../services/auth.service";
import { toSafeUser } from "../utils/userMapper";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/errors";

const router = Router();

/** POST /api/auth/login - verifies credentials, sets the httpOnly auth cookie. */
router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const user = await login(email, password);

    res.cookie(env.authCookieName, issueToken(user.id), authCookieOptions());
    res.status(200).json({ user: toSafeUser(user) });
  }),
);

/** POST /api/auth/logout - clears the auth cookie. */
router.post("/logout", (_req, res) => {
  res.clearCookie(env.authCookieName, clearCookieOptions());
  res.status(200).json({ success: true });
});

/** GET /api/auth/me - current authenticated, active user. */
router.get("/me", authenticate, (req, res) => {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication required.");
  }
  res.status(200).json({ user: req.user });
});

export default router;
