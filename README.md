# Bóveda

Sistema centralizado de gestión y archivo documental notarial. La aplicación relaciona minutas y actas por kardex, administra tomos y fojas, procesa documentos mediante OCR/QR y conserva los PDF en un servidor central.

## Arquitectura

- `src/`: interfaz React y TypeScript.
- `src-tauri/`: aplicación Windows, integración CZUR y procesamiento local.
- `src-tauri/vision/`: procesador Python/OpenCV y datos de Tesseract.
- `backend/`: API Express, autenticación, permisos, Prisma y pruebas.
- `backend/prisma/`: esquema y migraciones PostgreSQL.
- `docker-compose.yml`: PostgreSQL 18 y API/OCR central.
- `tools/`: utilidades de diagnóstico y evaluación OCR.

Los documentos, respaldos, instaladores, secretos, runtimes y resultados de compilación no forman parte del repositorio.

## Requisitos de desarrollo

- Node.js 22 y npm 11.
- Rust estable y WebView2 para Tauri.
- Docker Desktop para PostgreSQL o para ejecutar el servidor completo.
- Tesseract con idioma español cuando el backend se ejecute fuera de Docker.
- Python compatible y las dependencias de `src-tauri/vision/requirements.txt` para desarrollo local del flujo CZUR.

## Instalación local

```powershell
npm ci
npm --prefix backend ci
Copy-Item .env.example .env
Copy-Item backend/.env.example backend/.env
Copy-Item servidor-docker.env.example servidor-docker.env
docker compose --env-file servidor-docker.env up -d postgres
npm --prefix backend run prisma:generate
npm --prefix backend run prisma:deploy
```

Antes de iniciar por primera vez, sustituya todas las claves de ejemplo. Para crear la cuenta inicial configure `SEED_ADMIN_*` en `backend/.env` y ejecute:

```powershell
npm --prefix backend run seed
```

Desarrollo:

```powershell
npm run backend:dev
npm run dev
```

Aplicación de escritorio:

```powershell
npm run tauri:dev
```

## Servidor central Docker

En Windows, abra Docker Desktop y ejecute `CONFIGURAR-SERVIDOR-DOCKER.bat` como administrador. El configurador:

1. genera `servidor-docker.env` con secretos aleatorios;
2. construye PostgreSQL, API y OCR;
3. habilita el puerto 4000 únicamente para la red privada local;
4. registra el inicio automático;
5. verifica `/api/health/ready`.

Las estaciones se configuran ejecutando `CONFIGURAR-ESTACION-BOVEDA.bat` e indicando la URL fija del servidor, por ejemplo `http://192.168.10.141:4000`.

`RESTAURAR-DATOS-SERVIDOR-DOCKER.bat` acepta una copia externa con esta estructura:

```text
migracion/
├── sigadn.dump
└── storage/
```

La carpeta `migracion/` está excluida de Git porque contiene información notarial real.

## OCR de escritorio

Para desarrollo puede crear el entorno local:

```powershell
python -m venv src-tauri/vision/.venv
src-tauri/vision/.venv/Scripts/pip install -r src-tauri/vision/requirements.txt
```

Los instaladores oficiales incorporan un runtime Python preparado en `src-tauri/vision/runtime`. Ese runtime binario se genera durante el proceso de entrega y no se versiona. El servidor Docker instala sus propias dependencias OCR desde `requirements.txt`.

## Verificación

```powershell
npm run build
npm run lint
npm run backend:build
npm run backend:test
```

## Seguridad del repositorio

Nunca suba:

- `.env`, `servidor-docker.env` o contraseñas;
- `backend/storage/` o respaldos `*.dump`;
- `ENTREGA-OTRA-PC/`, instaladores o datos de migración;
- runtimes Python, `node_modules`, `dist` o `src-tauri/target`;
- logs, capturas de diagnóstico o datos exportados.

Use únicamente datos ficticios en pruebas y ejemplos.
