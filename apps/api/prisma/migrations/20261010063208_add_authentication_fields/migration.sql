-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER', 'VIEWER');

-- AlterTable
-- passwordHash is added as nullable first so pre-existing rows are preserved,
-- then backfilled with an empty sentinel that can never match any password
-- (login rejects empty/invalid hashes), then enforced as NOT NULL.
-- Existing users keep least-privilege role TEAM_MEMBER and stay unable to
-- authenticate until an admin establishes real credentials for them.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

UPDATE "User" SET "passwordHash" = '' WHERE "passwordHash" IS NULL;

ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "role" "SystemRole" NOT NULL DEFAULT 'TEAM_MEMBER';
