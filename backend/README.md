# API central de SIGADN

Servicio Express con PostgreSQL, Prisma, autenticación, auditoría, documentos, tomos, reportes y procesamiento OCR.

## Desarrollo local

1. Copiar `.env.example` como `.env` y reemplazar todos los secretos de ejemplo.
2. Desde la raíz, iniciar PostgreSQL con `docker compose up -d postgres`.
3. En esta carpeta, ejecutar:

```powershell
npm install
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run dev
```

El API queda disponible en `http://localhost:4000/api`.

## Verificación

```powershell
npm run lint
npm run build
npm test
```

Use una base separada para pruebas que modifiquen información. Los archivos `.env`, informes de importación y el almacenamiento documental están excluidos de Git.

Para instalar el sistema completo con Docker, restaurar datos o configurar una estación, consulte el [README principal](../README.md).
