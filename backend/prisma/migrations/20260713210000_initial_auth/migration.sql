CREATE TYPE "Role" AS ENUM ('ADMINISTRADOR', 'NOTARIO', 'SECRETARIA', 'ARCHIVADOR', 'AUDITOR');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO', 'PENDIENTE');
CREATE TYPE "AuditResult" AS ENUM ('EXITOSO', 'ERROR', 'DENEGADO');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "username" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "phone" TEXT,
  "avatarUrl" TEXT,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'PENDIENTE',
  "protectedAccount" BOOLEAN NOT NULL DEFAULT false,
  "lastAccessAt" TIMESTAMP(3),
  "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
  "tempPasswordExpiresAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "UserSession" (
  "id" UUID NOT NULL,"userId" UUID NOT NULL,"tokenHash" TEXT NOT NULL,"ipAddress" TEXT,"userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,"revokedAt" TIMESTAMP(3),CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL,"userId" UUID,"action" TEXT NOT NULL,"module" TEXT NOT NULL,"targetType" TEXT,"targetId" TEXT,"detail" TEXT,
  "oldValues" JSONB,"newValues" JSONB,"ipAddress" TEXT,"userAgent" TEXT,"result" "AuditResult" NOT NULL DEFAULT 'EXITOSO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");CREATE INDEX "UserSession_userId_revokedAt_idx" ON "UserSession"("userId", "revokedAt");CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");CREATE INDEX "AuditEvent_action_module_result_idx" ON "AuditEvent"("action", "module", "result");
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
