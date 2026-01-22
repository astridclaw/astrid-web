-- CreateTable
CREATE TABLE "webhook_delivery_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseCode" INTEGER,
    "responseTimeMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_userId_createdAt_idx" ON "webhook_delivery_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_taskId_idx" ON "webhook_delivery_logs"("taskId");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_status_idx" ON "webhook_delivery_logs"("status");
