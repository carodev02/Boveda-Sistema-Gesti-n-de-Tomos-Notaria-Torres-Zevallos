UPDATE "Document" d
SET "kardexCaseId" = c."id"
FROM "KardexCase" c
WHERE c."normalizedKardex" = COALESCE(NULLIF(LTRIM(REGEXP_REPLACE(UPPER(TRIM(d."kardex")), '^(KARDEX|K)[ -]*', ''), '0'), ''), '0')
  AND c."periodKey" = CASE WHEN d."year" IS NOT NULL THEN d."year"::TEXT WHEN d."bienniumStart" IS NOT NULL AND d."bienniumEnd" IS NOT NULL THEN d."bienniumStart" || '-' || d."bienniumEnd" ELSE 'SIN-PERIODO' END
  AND c."tomeNumber" = COALESCE(NULLIF(TRIM(d."tomo"), ''), 'SIN-TOMO')
  AND d."kardexCaseId" IS NULL;

UPDATE "KardexCase" c SET "primaryContractor" = source.name
FROM (
  SELECT DISTINCT ON (d."kardexCaseId") d."kardexCaseId" AS case_id, dc.name
  FROM "Document" d JOIN "DocumentContractor" dc ON dc."documentId"=d.id
  WHERE d."kardexCaseId" IS NOT NULL AND LOWER(d."documentType") LIKE '%minuta%'
  ORDER BY d."kardexCaseId", dc.position
) source
WHERE c.id=source.case_id AND c."primaryContractor" IS NULL;
