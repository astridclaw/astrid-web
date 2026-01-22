-- Drop legacy many-to-many relationships for admins and members
-- These have been replaced by the ListMember junction table

-- Drop the foreign key constraints and join tables
DROP TABLE IF EXISTS "_ListAdmin" CASCADE;
DROP TABLE IF EXISTS "_ListMember" CASCADE;

-- Note: The ListMember table already exists and has all the data
