import argon2 from "argon2";
import { PrismaClient, type SystemRole } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedAccount {
  label: string;
  emailEnv: string;
  passwordEnv: string;
  defaultEmail: string;
  defaultPassword: string;
  name: string;
  role: SystemRole;
}

/**
 * Development-only accounts. Credentials can be overridden via environment
 * variables; the defaults below are documented in README.md and must NEVER
 * be used outside local development.
 */
const ACCOUNTS: SeedAccount[] = [
  {
    label: "Administrator",
    emailEnv: "SEED_ADMIN_EMAIL",
    passwordEnv: "SEED_ADMIN_PASSWORD",
    defaultEmail: "admin@neostats.dev",
    defaultPassword: "Admin@12345!",
    name: "Ada Admin",
    role: "ADMIN",
  },
  {
    label: "Project Manager",
    emailEnv: "SEED_MANAGER_EMAIL",
    passwordEnv: "SEED_MANAGER_PASSWORD",
    defaultEmail: "manager@neostats.dev",
    defaultPassword: "Manager@12345!",
    name: "Morgan Manager",
    role: "PROJECT_MANAGER",
  },
  {
    label: "Team Member",
    emailEnv: "SEED_MEMBER_EMAIL",
    passwordEnv: "SEED_MEMBER_PASSWORD",
    defaultEmail: "member@neostats.dev",
    defaultPassword: "Member@12345!",
    name: "Terry Member",
    role: "TEAM_MEMBER",
  },
  {
    label: "Viewer",
    emailEnv: "SEED_VIEWER_EMAIL",
    passwordEnv: "SEED_VIEWER_PASSWORD",
    defaultEmail: "viewer@neostats.dev",
    defaultPassword: "Viewer@12345!",
    name: "Vic Viewer",
    role: "VIEWER",
  },
];

export interface SeedResult {
  created: string[];
  skipped: string[];
}

/**
 * Idempotent: creates each account only if the email does not exist yet.
 * Re-running never duplicates users and never overwrites existing passwords.
 */
export async function runSeed(): Promise<SeedResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const account of ACCOUNTS) {
    const email = (process.env[account.emailEnv] ?? account.defaultEmail).trim().toLowerCase();
    const password = process.env[account.passwordEnv] ?? account.defaultPassword;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      skipped.push(email);
      continue;
    }

    await prisma.user.create({
      data: {
        email,
        name: account.name,
        role: account.role,
        isActive: true,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      },
    });
    created.push(email);
  }

  return { created, skipped };
}

if (typeof require !== "undefined" && require.main === module) {
  runSeed()
    .then((result) => {
      console.log(
        `[seed] done - created: ${result.created.length}, skipped (already exist): ${result.skipped.length}`,
      );
      if (result.created.length) console.log(`[seed] created: ${result.created.join(", ")}`);
      if (result.skipped.length) console.log(`[seed] skipped: ${result.skipped.join(", ")}`);
      console.log("[seed] development-only credentials; see README.md. Never reuse them in production.");
    })
    .catch((error: unknown) => {
      console.error("[seed] failed:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
