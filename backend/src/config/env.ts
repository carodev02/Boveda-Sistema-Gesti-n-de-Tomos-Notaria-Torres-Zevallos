import 'dotenv/config';
import {z} from 'zod';

const schema=z.object({
  NODE_ENV:z.enum(['development','test','production']).default('development'),
  PORT:z.coerce.number().int().positive().default(4000),
  HOST:z.string().default('0.0.0.0'),
  DATABASE_URL:z.string().min(1),
  JWT_SECRET:z.string().min(32),
  FRONTEND_URL:z.string().url().default('http://localhost:5173'),
  PASSWORD_RESET_TEMP_EXPIRATION:z.coerce.number().positive().default(24),
  SESSION_EXPIRATION_HOURS:z.coerce.number().positive().default(12),
  MAX_FAILED_LOGIN_ATTEMPTS:z.coerce.number().int().positive().default(5),
  COOKIE_SECURE:z.string().default('false').transform(value=>value==='true')
  ,STORAGE_ROOT:z.string().default('storage'),
  VISION_ROOT:z.string().default('../src-tauri/vision'),
  MAX_PDF_UPLOAD_MB:z.coerce.number().int().min(1).max(500).default(200)
});

export const env=schema.parse(process.env);
