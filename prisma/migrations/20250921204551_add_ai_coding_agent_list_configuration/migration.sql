-- AlterTable
ALTER TABLE "public"."TaskList" ADD COLUMN     "aiAgentsEnabled" JSONB DEFAULT '[]',
ADD COLUMN     "fallbackAiProvider" TEXT,
ADD COLUMN     "githubRepositoryId" TEXT,
ADD COLUMN     "preferredAiProvider" TEXT;
