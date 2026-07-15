-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "isTestData" BOOLEAN NOT NULL DEFAULT false;
