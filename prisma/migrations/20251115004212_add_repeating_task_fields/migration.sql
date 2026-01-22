-- CreateEnum
CREATE TYPE "public"."RepeatFromMode" AS ENUM ('DUE_DATE', 'COMPLETION_DATE');

-- DropForeignKey
ALTER TABLE "public"."Comment" DROP CONSTRAINT "Comment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Task" DROP CONSTRAINT "Task_creatorId_fkey";

-- AlterTable
ALTER TABLE "public"."Comment" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "repeatFrom" "public"."RepeatFromMode" NOT NULL DEFAULT 'COMPLETION_DATE',
ALTER COLUMN "creatorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."TaskList" ADD COLUMN     "manualSortOrder" JSONB,
ADD COLUMN     "publicListType" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "defaultTaskDueOffset" TEXT DEFAULT '1_week',
ADD COLUMN     "emailToTaskEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailToTaskListId" TEXT,
ADD COLUMN     "invitedBy" TEXT,
ADD COLUMN     "isPlaceholder" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."ai_agents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."OAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "grantTypes" TEXT[] DEFAULT ARRAY['client_credentials']::TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY['tasks:read', 'tasks:write', 'lists:read', 'lists:write']::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthToken" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Shortcode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shortcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "public"."OAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClient_userId_idx" ON "public"."OAuthClient"("userId");

-- CreateIndex
CREATE INDEX "OAuthClient_clientId_idx" ON "public"."OAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClient_isActive_idx" ON "public"."OAuthClient"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_accessToken_key" ON "public"."OAuthToken"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_refreshToken_key" ON "public"."OAuthToken"("refreshToken");

-- CreateIndex
CREATE INDEX "OAuthToken_userId_idx" ON "public"."OAuthToken"("userId");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "public"."OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_accessToken_idx" ON "public"."OAuthToken"("accessToken");

-- CreateIndex
CREATE INDEX "OAuthToken_expiresAt_idx" ON "public"."OAuthToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthToken_revokedAt_idx" ON "public"."OAuthToken"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_code_key" ON "public"."OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_code_idx" ON "public"."OAuthAuthorizationCode"("code");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_clientId_idx" ON "public"."OAuthAuthorizationCode"("clientId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "public"."OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shortcode_code_key" ON "public"."Shortcode"("code");

-- CreateIndex
CREATE INDEX "Shortcode_code_idx" ON "public"."Shortcode"("code");

-- CreateIndex
CREATE INDEX "Shortcode_targetId_targetType_idx" ON "public"."Shortcode"("targetId", "targetType");

-- CreateIndex
CREATE INDEX "Shortcode_userId_idx" ON "public"."Shortcode"("userId");

-- CreateIndex
CREATE INDEX "Shortcode_isActive_idx" ON "public"."Shortcode"("isActive");

-- CreateIndex
CREATE INDEX "Shortcode_expiresAt_idx" ON "public"."Shortcode"("expiresAt");

-- CreateIndex
CREATE INDEX "Task_repeating_idx" ON "public"."Task"("repeating");

-- CreateIndex
CREATE INDEX "User_isPlaceholder_idx" ON "public"."User"("isPlaceholder");

-- CreateIndex
CREATE INDEX "User_invitedBy_idx" ON "public"."User"("invitedBy");

-- CreateIndex
CREATE INDEX "User_emailToTaskEnabled_idx" ON "public"."User"("emailToTaskEnabled");

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthClient" ADD CONSTRAINT "OAuthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthToken" ADD CONSTRAINT "OAuthToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthToken" ADD CONSTRAINT "OAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
