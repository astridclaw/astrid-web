-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "isAllDay" BOOLEAN NOT NULL DEFAULT false;

-- Data Migration: Set isAllDay = true for tasks where dueDateTime is at midnight UTC
-- (This catches tasks created with date-only where time was set to midnight)
UPDATE "public"."Task"
SET "isAllDay" = true
WHERE "dueDateTime" IS NOT NULL
  AND EXTRACT(HOUR FROM "dueDateTime" AT TIME ZONE 'UTC') = 0
  AND EXTRACT(MINUTE FROM "dueDateTime" AT TIME ZONE 'UTC') = 0
  AND EXTRACT(SECOND FROM "dueDateTime" AT TIME ZONE 'UTC') = 0;
