import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

/**
 * GET /api/health - liveness + database connectivity probe.
 * Database failures are logged server-side; internal error details are never returned.
 */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const startedAt = Date.now();
    let database: { status: "up" | "down"; latencyMs?: number };

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = { status: "up", latencyMs: Date.now() - startedAt };
    } catch (error) {
      console.error(
        "[health] database check failed:",
        error instanceof Error ? error.message : error,
      );
      database = { status: "down" };
    }

    res.status(200).json({
      status: "ok",
      service: "neostats-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      database,
    });
  }),
);

export default router;
