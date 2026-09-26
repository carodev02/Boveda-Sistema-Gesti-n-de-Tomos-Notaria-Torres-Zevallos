import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs/promises';
import path from 'node:path';
import {env} from './config/env.js';
import {prisma} from './config/prisma.js';
import {errorHandler,notFound} from './middlewares/error.middleware.js';
import {auditRouter} from './routes/audit.routes.js';
import {assistantRouter} from './routes/assistant.routes.js';
import {authRouter} from './routes/auth.routes.js';
import {documentsRouter} from './routes/documents.routes.js';
import {profileRouter} from './routes/profile.routes.js';
import {reportsRouter} from './routes/reports.routes.js';
import {settingsRouter} from './routes/settings.routes.js';
import {usersRouter} from './routes/users.routes.js';

const allowedOrigins=new Set([env.FRONTEND_URL,'http://tauri.localhost','https://tauri.localhost']);
export const app=express();
app.set('trust proxy',1);
app.use(helmet());
app.use((_req,res,next)=>{res.setHeader('Access-Control-Allow-Private-Network','true');next()});
app.use(cors({origin:(origin,callback)=>callback(null,!origin||allowedOrigins.has(origin)),credentials:true}));
app.use(express.json({limit:'1mb'}));
app.use((_req,res,next)=>{res.setHeader('Content-Type','application/json; charset=utf-8');next()});
app.use(cookieParser());
app.get('/api/health/live',(_req,res)=>res.json({status:'ok',uptimeSeconds:Math.floor(process.uptime()),timestamp:new Date().toISOString()}));
const readiness=async(_req:express.Request,res:express.Response)=>{
  const checks:{database:'ok'|'error';storage:'ok'|'error';ocrWorker:'ok'|'error'}={database:'error',storage:'error',ocrWorker:'error'};
  try{await prisma.$queryRaw`SELECT 1`;checks.database='ok'}catch{/* El estado degradado se comunica en la respuesta. */}
  try{const storage=path.resolve(env.STORAGE_ROOT);await fs.mkdir(storage,{recursive:true});await fs.access(storage);checks.storage='ok'}catch{/* El estado degradado se comunica en la respuesta. */}
  try{await fs.access(path.resolve(env.VISION_ROOT,'processor.py'));checks.ocrWorker='ok'}catch{/* El estado degradado se comunica en la respuesta. */}
  const ready=Object.values(checks).every(value=>value==='ok');
  res.status(ready?200:503).json({status:ready?'ready':'degraded',checks,uptimeSeconds:Math.floor(process.uptime()),timestamp:new Date().toISOString()});
};
app.get('/api/health',readiness);
app.get('/api/health/ready',readiness);
app.use('/api/auth',authRouter);
app.use('/api/profile',profileRouter);
app.use('/api/reports',reportsRouter);
app.use('/api/users',usersRouter);
app.use('/api/documents',documentsRouter);
app.use('/api/settings',settingsRouter);
app.use('/api/audit',auditRouter);
app.use('/api/assistant',assistantRouter);
app.use(notFound);
app.use(errorHandler);
