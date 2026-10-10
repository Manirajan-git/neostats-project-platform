import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseDurationMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallbackMs;
  const units: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1]) * units[match[2]];
}

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (nodeEnv === "production") {
    if (!secret || secret.length < 32) {
      throw new Error(
        "JWT_SECRET must be set to a random string of at least 32 characters when NODE_ENV=production. " +
          "Refusing to start without a strong secret.",
      );
    }
    return secret;
  }

  if (secret && secret.length >= 32) return secret;
  if (secret) {
    console.warn("[env] JWT_SECRET is shorter than 32 characters; acceptable for development only.");
    return secret;
  }

  const ephemeral = crypto.randomBytes(32).toString("hex");
  console.warn(
    "[env] JWT_SECRET is not set; using an ephemeral development secret. Sessions reset whenever the API restarts.",
  );
  return ephemeral;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing. Copy apps/api/.env.example to apps/api/.env and configure it.");
}

const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "8h";
const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  /** Trusted browser origins (explicit allowlist - never `*` when credentials are used). */
  trustedOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn,
  cookieMaxAgeMs: parseDurationMs(jwtExpiresIn, 8 * 3_600_000),
  authCookieName: process.env.AUTH_COOKIE_NAME ?? "neostats_token",
};
