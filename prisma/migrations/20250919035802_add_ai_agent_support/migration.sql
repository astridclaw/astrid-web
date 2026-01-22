-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "aiAgentConfig" TEXT,
ADD COLUMN     "aiAgentType" TEXT,
ADD COLUMN     "isAIAgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookUrl" TEXT;

-- CreateIndex
CREATE INDEX "User_isAIAgent_idx" ON "public"."User"("isAIAgent");

-- CreateIndex
CREATE INDEX "User_aiAgentType_idx" ON "public"."User"("aiAgentType");

-- CreateIndex
CREATE INDEX "User_isAIAgent_aiAgentType_idx" ON "public"."User"("isAIAgent", "aiAgentType");
