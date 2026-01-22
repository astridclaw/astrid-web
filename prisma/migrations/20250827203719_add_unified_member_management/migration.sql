-- CreateTable
CREATE TABLE "public"."ListMember" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ListInvite" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ListMember_listId_idx" ON "public"."ListMember"("listId");

-- CreateIndex
CREATE INDEX "ListMember_userId_idx" ON "public"."ListMember"("userId");

-- CreateIndex
CREATE INDEX "ListMember_listId_role_idx" ON "public"."ListMember"("listId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ListMember_listId_userId_key" ON "public"."ListMember"("listId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ListInvite_token_key" ON "public"."ListInvite"("token");

-- CreateIndex
CREATE INDEX "ListInvite_listId_idx" ON "public"."ListInvite"("listId");

-- CreateIndex
CREATE INDEX "ListInvite_email_idx" ON "public"."ListInvite"("email");

-- CreateIndex
CREATE INDEX "ListInvite_token_idx" ON "public"."ListInvite"("token");

-- CreateIndex
CREATE INDEX "ListInvite_createdBy_idx" ON "public"."ListInvite"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "ListInvite_listId_email_key" ON "public"."ListInvite"("listId", "email");

-- AddForeignKey
ALTER TABLE "public"."ListMember" ADD CONSTRAINT "ListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListMember" ADD CONSTRAINT "ListMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListInvite" ADD CONSTRAINT "ListInvite_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ListInvite" ADD CONSTRAINT "ListInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
