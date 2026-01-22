-- CreateEnum
CREATE TYPE "public"."MCPAccessLevel" AS ENUM ('READ', 'WRITE', 'BOTH');

-- AlterTable
ALTER TABLE "public"."TaskList" ADD COLUMN     "mcpAccessLevel" "public"."MCPAccessLevel" NOT NULL DEFAULT 'WRITE',
ADD COLUMN     "mcpEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "mcpEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mcpSettings" TEXT;

-- CreateTable
CREATE TABLE "public"."MCPToken" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "token" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT[],
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MCPToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MCPToken_token_key" ON "public"."MCPToken"("token");

-- CreateIndex
CREATE INDEX "MCPToken_listId_idx" ON "public"."MCPToken"("listId");

-- CreateIndex
CREATE INDEX "MCPToken_userId_idx" ON "public"."MCPToken"("userId");

-- CreateIndex
CREATE INDEX "MCPToken_token_idx" ON "public"."MCPToken"("token");

-- CreateIndex
CREATE INDEX "MCPToken_expiresAt_idx" ON "public"."MCPToken"("expiresAt");

-- CreateIndex
CREATE INDEX "MCPToken_isActive_idx" ON "public"."MCPToken"("isActive");

-- CreateIndex
CREATE INDEX "TaskList_mcpEnabled_idx" ON "public"."TaskList"("mcpEnabled");

-- AddForeignKey
ALTER TABLE "public"."MCPToken" ADD CONSTRAINT "MCPToken_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MCPToken" ADD CONSTRAINT "MCPToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
