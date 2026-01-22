-- Migration: Update "due_before_tomorrow" filter values to "today"
-- This migration handles the removal of the redundant "due_before_tomorrow" filter option
-- since "today" filter now includes overdue tasks, making "due_before_tomorrow" redundant

-- Update TaskList filterDueDate field
UPDATE "TaskList"
SET "filterDueDate" = 'today'
WHERE "filterDueDate" = 'due_before_tomorrow';

-- Also check for any JSON fields that might contain this filter value
-- (Currently there are no JSON fields storing filter settings, but this is future-proofing)

-- Update any User settings that might reference this filter
-- (aiAssistantSettings and mcpSettings are JSON fields that could potentially store filter preferences)
UPDATE "User"
SET "aiAssistantSettings" = REPLACE("aiAssistantSettings", '"due_before_tomorrow"', '"today"')
WHERE "aiAssistantSettings" IS NOT NULL
  AND "aiAssistantSettings" LIKE '%due_before_tomorrow%';

UPDATE "User"
SET "mcpSettings" = REPLACE("mcpSettings", '"due_before_tomorrow"', '"today"')
WHERE "mcpSettings" IS NOT NULL
  AND "mcpSettings" LIKE '%due_before_tomorrow%';

-- Note: This migration is safe to run multiple times (idempotent)
-- It only updates records that still contain the old filter value