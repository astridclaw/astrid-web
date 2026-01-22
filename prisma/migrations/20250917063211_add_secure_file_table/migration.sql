-- CreateTable
CREATE TABLE "public"."SecureFile" (
    "id" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "taskId" TEXT,
    "listId" TEXT,
    "commentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecureFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecureFile_blobUrl_key" ON "public"."SecureFile"("blobUrl");

-- CreateIndex
CREATE INDEX "SecureFile_uploadedBy_idx" ON "public"."SecureFile"("uploadedBy");

-- CreateIndex
CREATE INDEX "SecureFile_taskId_idx" ON "public"."SecureFile"("taskId");

-- CreateIndex
CREATE INDEX "SecureFile_listId_idx" ON "public"."SecureFile"("listId");

-- CreateIndex
CREATE INDEX "SecureFile_commentId_idx" ON "public"."SecureFile"("commentId");

-- CreateIndex
CREATE INDEX "SecureFile_createdAt_idx" ON "public"."SecureFile"("createdAt");

-- CreateIndex
CREATE INDEX "SecureFile_blobUrl_idx" ON "public"."SecureFile"("blobUrl");

-- AddForeignKey
ALTER TABLE "public"."SecureFile" ADD CONSTRAINT "SecureFile_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecureFile" ADD CONSTRAINT "SecureFile_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecureFile" ADD CONSTRAINT "SecureFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SecureFile" ADD CONSTRAINT "SecureFile_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
