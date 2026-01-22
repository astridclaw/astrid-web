-- Migration script to add favorites system fields to TaskList table
-- This preserves existing data and adds new fields with proper defaults

BEGIN;

-- Add new columns with safe defaults
ALTER TABLE "TaskList" 
ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS "favoriteOrder" INTEGER,
ADD COLUMN IF NOT EXISTS "filterCompletion" TEXT,
ADD COLUMN IF NOT EXISTS "filterDueDate" TEXT,
ADD COLUMN IF NOT EXISTS "filterAssignee" TEXT,
ADD COLUMN IF NOT EXISTS "virtualListType" TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "TaskList_isFavorite_favoriteOrder_idx" ON "TaskList"("isFavorite", "favoriteOrder");
CREATE INDEX IF NOT EXISTS "TaskList_ownerId_isFavorite_idx" ON "TaskList"("ownerId", "isFavorite");
CREATE INDEX IF NOT EXISTS "TaskList_virtualListType_idx" ON "TaskList"("virtualListType");

-- Update any existing NULL values to proper defaults
UPDATE "TaskList" 
SET "isFavorite" = FALSE 
WHERE "isFavorite" IS NULL;

COMMIT;