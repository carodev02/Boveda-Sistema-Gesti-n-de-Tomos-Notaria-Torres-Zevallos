CREATE TABLE "Document" (
  "id" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "storageName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "pageCount" INTEGER NOT NULL,
  "documentMode" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "year" INTEGER,
  "biennium" TEXT,
  "tomo" TEXT NOT NULL,
  "fojaInitial" INTEGER,
  "fojaFinal" INTEGER,
  "escritura" TEXT,
  "kardex" TEXT,
  "minuta" TEXT,
  "actoJuridico" TEXT,
  "documentDate" TEXT,
  "observations" TEXT,
  "ocrConfidence" DOUBLE PRECISION,
  "documentStatus" TEXT NOT NULL DEFAULT 'En revisión',
  "ocrStatus" TEXT NOT NULL DEFAULT 'Procesado',
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Document_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Document_storageName_key" UNIQUE ("storageName"),
  CONSTRAINT "Document_fileHash_key" UNIQUE ("fileHash"),
  CONSTRAINT "Document_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "DocumentContractor" (
  "id" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "DocumentContractor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentContractor_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Document_documentType_year_biennium_tomo_idx" ON "Document"("documentType", "year", "biennium", "tomo");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");
CREATE INDEX "DocumentContractor_documentId_idx" ON "DocumentContractor"("documentId");
