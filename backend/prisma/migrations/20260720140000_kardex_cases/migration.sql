CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE "KardexCase" (
  "id" UUID NOT NULL,
  "normalizedKardex" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "year" INTEGER,
  "bienniumStart" INTEGER,
  "bienniumEnd" INTEGER,
  "tomeNumber" TEXT NOT NULL,
  "legalAct" TEXT,
  "primaryContractor" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KardexCase_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Document" ADD COLUMN "kardexCaseId" UUID;
CREATE UNIQUE INDEX "KardexCase_normalizedKardex_periodKey_tomeNumber_key" ON "KardexCase"("normalizedKardex", "periodKey", "tomeNumber");
CREATE INDEX "KardexCase_normalizedKardex_idx" ON "KardexCase"("normalizedKardex");
CREATE INDEX "Document_kardexCaseId_idx" ON "Document"("kardexCaseId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_kardexCaseId_fkey" FOREIGN KEY ("kardexCaseId") REFERENCES "KardexCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH normalized AS (
  SELECT d."id", COALESCE(NULLIF(LTRIM(REGEXP_REPLACE(UPPER(TRIM(d."kardex")), '^(KARDEX|K)[ -]*', ''), '0'), ''), '0') AS kardex,
    CASE WHEN d."year" IS NOT NULL THEN d."year"::TEXT WHEN d."bienniumStart" IS NOT NULL AND d."bienniumEnd" IS NOT NULL THEN d."bienniumStart" || '-' || d."bienniumEnd" ELSE 'SIN-PERIODO' END AS period_key,
    COALESCE(NULLIF(TRIM(d."tomo"), ''), 'SIN-TOMO') AS tome, d."year", d."bienniumStart", d."bienniumEnd", d."documentType", d."actoJuridico"
  FROM "Document" d WHERE d."kardex" IS NOT NULL AND TRIM(d."kardex") <> ''
), inserted AS (
  INSERT INTO "KardexCase" ("id","normalizedKardex","periodKey","year","bienniumStart","bienniumEnd","tomeNumber","legalAct","status","updatedAt")
  SELECT gen_random_uuid(), kardex, period_key, year, "bienniumStart", "bienniumEnd", tome, MAX("actoJuridico"),
    CASE WHEN BOOL_OR(LOWER("documentType") LIKE '%minuta%') AND BOOL_OR(LOWER("documentType") NOT LIKE '%minuta%') THEN 'Relación completa' WHEN BOOL_OR(LOWER("documentType") LIKE '%minuta%') THEN 'Solo Minuta' ELSE 'Solo Acta' END, CURRENT_TIMESTAMP
  FROM normalized GROUP BY kardex,period_key,tome,year,"bienniumStart","bienniumEnd"
  ON CONFLICT DO NOTHING RETURNING "id","normalizedKardex","periodKey","tomeNumber"
)
UPDATE "Document" d SET "kardexCaseId"=c."id" FROM normalized n, "KardexCase" c
WHERE d."id"=n."id" AND c."normalizedKardex"=n.kardex AND c."periodKey"=n.period_key AND c."tomeNumber"=n.tome;
