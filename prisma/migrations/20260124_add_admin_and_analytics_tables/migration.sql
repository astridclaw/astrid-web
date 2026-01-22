-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDailyStats" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dau" INTEGER NOT NULL,
    "wau" INTEGER NOT NULL,
    "mau" INTEGER NOT NULL,
    "dauWebDesktop" INTEGER NOT NULL DEFAULT 0,
    "dauWebIPhone" INTEGER NOT NULL DEFAULT 0,
    "dauWebAndroid" INTEGER NOT NULL DEFAULT 0,
    "dauIOSApp" INTEGER NOT NULL DEFAULT 0,
    "dauAPIOther" INTEGER NOT NULL DEFAULT 0,
    "dauUnknown" INTEGER NOT NULL DEFAULT 0,
    "taskCreated" INTEGER NOT NULL DEFAULT 0,
    "taskEdited" INTEGER NOT NULL DEFAULT 0,
    "taskCompleted" INTEGER NOT NULL DEFAULT 0,
    "taskDeleted" INTEGER NOT NULL DEFAULT 0,
    "commentAdded" INTEGER NOT NULL DEFAULT 0,
    "commentDeleted" INTEGER NOT NULL DEFAULT 0,
    "listAdded" INTEGER NOT NULL DEFAULT 0,
    "listEdited" INTEGER NOT NULL DEFAULT 0,
    "listDeleted" INTEGER NOT NULL DEFAULT 0,
    "settingsUpdated" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_eventType_createdAt_idx" ON "AnalyticsEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_platform_createdAt_idx" ON "AnalyticsEvent"("platform", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDailyStats_date_key" ON "AnalyticsDailyStats"("date");

-- CreateIndex
CREATE INDEX "AnalyticsDailyStats_date_idx" ON "AnalyticsDailyStats"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_userId_key" ON "AdminUser"("userId");

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
