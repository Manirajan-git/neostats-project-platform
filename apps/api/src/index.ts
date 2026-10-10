import { env } from "./config/env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[api] listening on http://localhost:${env.port}`);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down.`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  // Failsafe if a connection keeps the server open.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
