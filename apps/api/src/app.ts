import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requireTrustedOrigin } from "./middleware/trustedOrigin";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.routes";
import usersRoutes from "./routes/users.routes";
import projectsRoutes from "./routes/projects.routes";
import tasksRoutes from "./routes/tasks.routes";
import notificationsRoutes from "./routes/notifications.routes";
import dashboardRoutes, { activityRouter } from "./routes/dashboard.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");

  // Credentialed CORS with an explicit origin allowlist (never `*`).
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.trustedOrigins.includes(origin)) {
          callback(null, origin ?? false);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // CSRF defence-in-depth for state-changing requests (cookie auth).
  app.use(requireTrustedOrigin);

  app.use("/api/health", healthRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/projects", projectsRoutes);
  app.use("/api/tasks", tasksRoutes);
  app.use("/api/notifications", notificationsRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/activity", activityRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
