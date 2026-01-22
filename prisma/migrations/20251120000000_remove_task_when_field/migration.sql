-- AlterTable: Remove deprecated 'when' column from Task table
-- This migration drops the 'when' field and its index
-- All data should already be in 'dueDateTime' + 'isAllDay' fields

-- Drop the index on 'when' column
DROP INDEX IF EXISTS "Task_when_idx";

-- Drop the 'when' column
ALTER TABLE "Task" DROP COLUMN IF EXISTS "when";
