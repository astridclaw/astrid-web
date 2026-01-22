-- AlterTable
ALTER TABLE "Task" ADD COLUMN "aiAgentId" TEXT;

-- CreateIndex
CREATE INDEX "Task_aiAgentId_idx" ON "Task"("aiAgentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "ai_agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;