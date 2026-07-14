# Backend SIGADN — primera etapa

Este servicio sustituye la autenticación simulada y los JSON de usuarios, perfil y auditoría. Los documentos, PDF, tomos y OCR continúan en IndexedDB durante esta etapa.

## Puesta en marcha

1. Copiar `.env.example` como `.env` y cambiar `JWT_SECRET` y `SEED_ADMIN_PASSWORD`.
2. Desde la raíz ejecutar `docker compose up -d postgres`.
3. En `backend/`, ejecutar `npm install`, `npm run prisma:generate`, `npm run prisma:deploy` y `npm run seed`.
4. Ejecutar `npm run dev` en `backend/` y `npm run dev` en la raíz.
5. Abrir `http://localhost:5173`. Vite reenvía `/api` a Express en el puerto 4000.

La sesión se entrega en una cookie `HttpOnly`. PostgreSQL conserva únicamente el hash del token y permite revocar sesiones individualmente. El rol nunca se obtiene de `localStorage` ni de cabeceras enviadas por el navegador.

## Importar el JSON anterior

Con PostgreSQL activo, ejecutar `npm run import:users`. El script lee `server/data/users.json`, evita duplicados, genera contraseñas temporales con bcrypt y escribe un informe local en `backend/import-reports/`. Esa carpeta está ignorada por Git y debe tratarse como confidencial. El JSON original no se elimina.

## Verificación

- `npm run build`
- `npm run lint`
- `npm test`

Las pruebas que requieren persistencia real deben ejecutarse contra una base de datos de pruebas separada antes del despliegue. Nunca usar la base productiva para pruebas destructivas.
