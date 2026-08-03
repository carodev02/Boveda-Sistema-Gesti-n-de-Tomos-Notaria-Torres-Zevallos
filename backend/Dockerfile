FROM node:22-bookworm-slim AS builder
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY backend/prisma ./prisma
RUN npm run prisma:generate && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PYTHON_EXECUTABLE=/opt/vision-venv/bin/python \
    TESSERACT_EXECUTABLE=/usr/bin/tesseract \
    VISION_ROOT=/app/vision \
    STORAGE_ROOT=/app/backend/storage
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr tesseract-ocr-spa libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/vision-venv
COPY src-tauri/vision/requirements.txt /app/vision/requirements.txt
RUN /opt/vision-venv/bin/pip install --no-cache-dir -r /app/vision/requirements.txt
WORKDIR /app/backend
COPY --from=builder /build/backend/node_modules ./node_modules
COPY --from=builder /build/backend/dist ./dist
COPY --from=builder /build/backend/prisma ./prisma
COPY backend/package.json backend/package-lock.json ./
COPY src-tauri/vision/processor.py /app/vision/processor.py
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 CMD ["node","-e","fetch('http://127.0.0.1:4000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["sh","-c","./node_modules/.bin/prisma migrate deploy && node dist/src/server.js"]
