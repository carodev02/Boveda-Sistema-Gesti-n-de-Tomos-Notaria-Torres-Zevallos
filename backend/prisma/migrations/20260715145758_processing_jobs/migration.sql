-- CreateEnum
CREATE TYPE "ProcessingJobStatus" AS ENUM ('UPLOADED', 'QUALITY_ANALYSIS', 'QUALITY_REVIEW', 'OCR_PENDING', 'OCR_PROCESSING', 'REVIEW_REQUIRED', 'READY_TO_SAVE', 'SAVING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DocumentProcessingJob" (
    "id" UUID NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "temporaryPath" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "station" TEXT,
    "status" "ProcessingJobStatus" NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdBy" UUID NOT NULL,
    "documentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityIssue" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrPage" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "engine" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OcrField" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "fieldName" TEXT NOT NULL,
    "extractedValue" TEXT,
    "normalizedValue" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "correctedBy" UUID,
    "correctedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentProcessingJob_documentId_key" ON "DocumentProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_status_createdAt_idx" ON "DocumentProcessingJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentProcessingJob_fileHash_idx" ON "DocumentProcessingJob"("fileHash");

-- CreateIndex
CREATE INDEX "QualityIssue_jobId_pageNumber_idx" ON "QualityIssue"("jobId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OcrPage_jobId_pageNumber_key" ON "OcrPage"("jobId", "pageNumber");

-- CreateIndex
CREATE INDEX "OcrField_jobId_fieldName_idx" ON "OcrField"("jobId", "fieldName");

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentProcessingJob" ADD CONSTRAINT "DocumentProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIssue" ADD CONSTRAINT "QualityIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrPage" ADD CONSTRAINT "OcrPage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcrField" ADD CONSTRAINT "OcrField_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "DocumentProcessingJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
