-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "dueDateTime" TIMESTAMP(3),
ADD COLUMN     "reminderSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reminderTime" TIMESTAMP(3),
ADD COLUMN     "reminderType" TEXT,
ALTER COLUMN "assigneeId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."TaskList" ADD COLUMN     "aiAstridEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "copyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultDueTime" TEXT,
ADD COLUMN     "favoriteOrder" INTEGER,
ADD COLUMN     "filterAssignedBy" TEXT,
ADD COLUMN     "filterAssignee" TEXT,
ADD COLUMN     "filterCompletion" TEXT,
ADD COLUMN     "filterDueDate" TEXT,
ADD COLUMN     "filterInLists" TEXT,
ADD COLUMN     "filterPriority" TEXT,
ADD COLUMN     "filterRepeating" TEXT,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isVirtual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortBy" TEXT,
ADD COLUMN     "virtualListType" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "aiAssistantSettings" TEXT,
ADD COLUMN     "defaultDueTime" TEXT DEFAULT '17:00';

-- CreateTable
CREATE TABLE "public"."ReminderSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enablePushReminders" BOOLEAN NOT NULL DEFAULT true,
    "enableEmailReminders" BOOLEAN NOT NULL DEFAULT true,
    "defaultReminderTime" INTEGER NOT NULL DEFAULT 60,
    "enableDailyDigest" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestTime" TEXT NOT NULL DEFAULT '09:00',
    "dailyDigestTimezone" TEXT NOT NULL DEFAULT 'UTC',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calendarSyncType" TEXT NOT NULL DEFAULT 'all',
    "enableCalendarSync" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReminderQueue" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSettings_userId_key" ON "public"."ReminderSettings"("userId");

-- CreateIndex
CREATE INDEX "ReminderSettings_userId_idx" ON "public"."ReminderSettings"("userId");

-- CreateIndex
CREATE INDEX "ReminderQueue_scheduledFor_status_idx" ON "public"."ReminderQueue"("scheduledFor", "status");

-- CreateIndex
CREATE INDEX "ReminderQueue_userId_status_idx" ON "public"."ReminderQueue"("userId", "status");

-- CreateIndex
CREATE INDEX "ReminderQueue_taskId_idx" ON "public"."ReminderQueue"("taskId");

-- CreateIndex
CREATE INDEX "ReminderQueue_type_status_idx" ON "public"."ReminderQueue"("type", "status");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_isActive_idx" ON "public"."PushSubscription"("userId", "isActive");

-- CreateIndex
CREATE INDEX "PushSubscription_endpoint_idx" ON "public"."PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_userId_endpoint_key" ON "public"."PushSubscription"("userId", "endpoint");

-- CreateIndex
CREATE INDEX "Task_dueDateTime_idx" ON "public"."Task"("dueDateTime");

-- CreateIndex
CREATE INDEX "Task_reminderTime_idx" ON "public"."Task"("reminderTime");

-- CreateIndex
CREATE INDEX "Task_dueDateTime_completed_idx" ON "public"."Task"("dueDateTime", "completed");

-- CreateIndex
CREATE INDEX "Task_reminderTime_reminderSent_idx" ON "public"."Task"("reminderTime", "reminderSent");

-- CreateIndex
CREATE INDEX "TaskList_isFavorite_favoriteOrder_idx" ON "public"."TaskList"("isFavorite", "favoriteOrder");

-- CreateIndex
CREATE INDEX "TaskList_ownerId_isFavorite_idx" ON "public"."TaskList"("ownerId", "isFavorite");

-- CreateIndex
CREATE INDEX "TaskList_virtualListType_idx" ON "public"."TaskList"("virtualListType");

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReminderSettings" ADD CONSTRAINT "ReminderSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReminderQueue" ADD CONSTRAINT "ReminderQueue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReminderQueue" ADD CONSTRAINT "ReminderQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
