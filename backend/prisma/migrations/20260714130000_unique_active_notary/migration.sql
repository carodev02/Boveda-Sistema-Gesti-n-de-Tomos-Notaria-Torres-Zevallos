CREATE UNIQUE INDEX "User_active_notary_unique"
ON "User" ("role")
WHERE "role" = 'NOTARIO' AND "status" = 'ACTIVO' AND "deletedAt" IS NULL;
