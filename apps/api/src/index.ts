import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express, { Request, Response } from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";

const PORT = Number(process.env.PORT ?? 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:3000";

const prisma = new PrismaClient();

const app = express();
app.use(cors({ origin: CORS_ORIGIN.split(",").map((o) => o.trim()) }));
app.use(express.json());

app.get("/api/health", async (_req: Request, res: Response) => {
  const startedAt = Date.now();
  let database: {
    status: "up" | "down";
    latencyMs?: number;
    error?: string;
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = { status: "up", latencyMs: Date.now() - startedAt };
  } catch (error) {
    database = {
      status: "down",
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }

  res.status(200).json({
    status: "ok",
    service: "neostats-api",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database,
  });
});

const server = app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
