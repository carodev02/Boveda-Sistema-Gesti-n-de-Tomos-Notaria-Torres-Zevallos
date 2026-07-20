ALTER TABLE "Document" ADD COLUMN "bienniumStart" INTEGER;
ALTER TABLE "Document" ADD COLUMN "bienniumEnd" INTEGER;

UPDATE "Document"
SET "bienniumStart" = substring("biennium" from '^([0-9]{4})')::INTEGER,
    "bienniumEnd" = substring("biennium" from '[0-9]{4}[-–]([0-9]{4})$')::INTEGER
WHERE "biennium" ~ '^[0-9]{4}[-–][0-9]{4}$';
