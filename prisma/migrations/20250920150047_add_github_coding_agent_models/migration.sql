-- CreateEnum
CREATE TYPE "public"."CodingWorkflowStatus" AS ENUM ('PENDING', 'PLANNING', 'AWAITING_APPROVAL', 'IMPLEMENTING', 'TESTING', 'READY_TO_MERGE', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."GitHubIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" INTEGER,
    "appId" INTEGER,
    "privateKey" TEXT,
    "webhookSecret" TEXT,
    "repositories" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CodingTaskWorkflow" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "repositoryId" TEXT,
    "baseBranch" TEXT NOT NULL DEFAULT 'main',
    "workingBranch" TEXT,
    "pullRequestNumber" INTEGER,
    "status" "public"."CodingWorkflowStatus" NOT NULL DEFAULT 'PENDING',
    "aiService" TEXT,
    "planApproved" BOOLEAN NOT NULL DEFAULT false,
    "deploymentUrl" TEXT,
    "previewUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodingTaskWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubIntegration_userId_key" ON "public"."GitHubIntegration"("userId");

-- CreateIndex
CREATE INDEX "GitHubIntegration_userId_idx" ON "public"."GitHubIntegration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CodingTaskWorkflow_taskId_key" ON "public"."CodingTaskWorkflow"("taskId");

-- CreateIndex
CREATE INDEX "CodingTaskWorkflow_taskId_idx" ON "public"."CodingTaskWorkflow"("taskId");

-- CreateIndex
CREATE INDEX "CodingTaskWorkflow_status_idx" ON "public"."CodingTaskWorkflow"("status");

-- AddForeignKey
ALTER TABLE "public"."GitHubIntegration" ADD CONSTRAINT "GitHubIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CodingTaskWorkflow" ADD CONSTRAINT "CodingTaskWorkflow_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
