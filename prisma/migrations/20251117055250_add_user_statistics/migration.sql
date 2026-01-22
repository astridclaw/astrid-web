-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "statsCompletedTasks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "statsInspiredTasks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "statsLastCalculated" TIMESTAMP(3),
ADD COLUMN     "statsSupportedTasks" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "User_statsLastCalculated_idx" ON "public"."User"("statsLastCalculated");
