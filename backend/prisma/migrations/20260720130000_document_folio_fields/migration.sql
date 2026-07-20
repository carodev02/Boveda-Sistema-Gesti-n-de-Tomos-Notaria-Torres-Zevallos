ALTER TABLE "Document" ADD COLUMN "folioRangeStart" INTEGER;
ALTER TABLE "Document" ADD COLUMN "folioRangeEnd" INTEGER;
ALTER TABLE "Document" ADD COLUMN "printedFolio" INTEGER;

-- En el flujo anterior fojaInitial recibía printedFolio. Se conserva esa
-- evidencia como foja exacta; no se inventa un rango que nunca fue guardado.
UPDATE "Document"
SET "printedFolio" = "fojaInitial"
WHERE "printedFolio" IS NULL AND "fojaInitial" IS NOT NULL;
