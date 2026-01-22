-- Initialize Astrid Task Manager Database
-- This script will create all necessary tables using Prisma schema

-- Enable UUID extension for better ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- The actual tables will be created by Prisma migrate
-- This script ensures the database is ready for Prisma
SELECT 'Database initialized for Astrid Task Manager' as status;
