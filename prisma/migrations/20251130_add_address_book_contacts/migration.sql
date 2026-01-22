-- CreateTable
CREATE TABLE "AddressBookContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "phoneNumber" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBookContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AddressBookContact_email_idx" ON "AddressBookContact"("email");

-- CreateIndex
CREATE INDEX "AddressBookContact_userId_idx" ON "AddressBookContact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressBookContact_userId_email_key" ON "AddressBookContact"("userId", "email");

-- AddForeignKey
ALTER TABLE "AddressBookContact" ADD CONSTRAINT "AddressBookContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
