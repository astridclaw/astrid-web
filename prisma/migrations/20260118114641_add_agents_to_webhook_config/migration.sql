-- AlterTable
ALTER TABLE "user_webhook_configs" ADD COLUMN "agents" TEXT[] DEFAULT ARRAY[]::TEXT[];
