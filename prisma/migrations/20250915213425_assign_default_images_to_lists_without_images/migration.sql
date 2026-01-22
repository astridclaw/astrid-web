-- Data Migration: Assign Default Images to Lists Without Images
-- This migration safely assigns consistent default images to lists that don't have an imageUrl set.
-- It uses a hash-based approach to ensure deterministic image assignment.

-- Function to calculate simple hash (similar to JavaScript version)
CREATE OR REPLACE FUNCTION simple_hash(input_text TEXT)
RETURNS INTEGER AS $$
DECLARE
    hash INTEGER := 0;
    char_code INTEGER;
    i INTEGER;
BEGIN
    FOR i IN 1..LENGTH(input_text) LOOP
        char_code := ASCII(SUBSTRING(input_text FROM i FOR 1));
        hash := ((hash << 5) - hash) + char_code;
        hash := hash & hash; -- Convert to 32-bit integer
    END LOOP;
    RETURN ABS(hash);
END;
$$ LANGUAGE plpgsql;

-- Update lists without images to have consistent default images
-- This is safe because it only updates NULL or empty imageUrl fields
UPDATE "TaskList"
SET "imageUrl" = CASE
    WHEN (simple_hash(id::TEXT) % 4) = 0 THEN '/icons/default_list_0.png'
    WHEN (simple_hash(id::TEXT) % 4) = 1 THEN '/icons/default_list_1.png'
    WHEN (simple_hash(id::TEXT) % 4) = 2 THEN '/icons/default_list_2.png'
    WHEN (simple_hash(id::TEXT) % 4) = 3 THEN '/icons/default_list_3.png'
END
WHERE "imageUrl" IS NULL OR "imageUrl" = '';

-- Clean up the temporary function
DROP FUNCTION IF EXISTS simple_hash(TEXT);

-- Add a comment to track this migration
COMMENT ON TABLE "TaskList" IS 'Default images assigned based on list ID hash for consistency';