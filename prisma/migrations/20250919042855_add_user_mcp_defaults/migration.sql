-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "defaultNewListMcpAccessLevel" TEXT NOT NULL DEFAULT 'WRITE',
ADD COLUMN     "defaultNewListMcpEnabled" BOOLEAN NOT NULL DEFAULT true;
