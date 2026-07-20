import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';

const root=path.resolve(env.STORAGE_ROOT);
const worker=path.resolve(process.cwd(),'..','src-tauri','vision','processor.py');
export async function enqueueOcrJob(jobId:string){
  const job=await prisma.documentProcessingJob.findUnique({where:{id:jobId}});if(!job)throw new Error('Trabajo documental inexistente.');if(['OCR_PROCESSING','REVIEW_REQUIRED','COMPLETED'].includes(job.status))return {jobId,status:job.status};
  await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PROCESSING'}});
  void runOcr(jobId,path.resolve(root,job.temporaryPath));
  return {jobId,status:'OCR_PROCESSING'};
}
async function runOcr(jobId:string,source:string){
  const session=path.join(root,'ocr-sessions',jobId);await fs.mkdir(session,{recursive:true});
  const child=spawn(process.env.PYTHON_EXECUTABLE??'python',[worker,'recognize','--source',source,'--session',session],{windowsHide:true});let output='';let error='';
  child.stdout.on('data',chunk=>{output+=chunk.toString()});child.stderr.on('data',chunk=>{error+=chunk.toString()});
  child.on('close',async code=>{try{if(code!==0)throw new Error(error||'El worker OCR terminó con error.');const result=JSON.parse(output);await prisma.$transaction(async tx=>{await tx.ocrPage.deleteMany({where:{jobId}});for(const page of result.pages??[])await tx.ocrPage.create({data:{jobId,pageNumber:Number(page.pageNumber),text:String(page.rawText??''),confidence:Number(page.averageConfidence??0),engine:String(page.engine??'tesseract')}});await tx.documentProcessingJob.update({where:{id:jobId},data:{status:'REVIEW_REQUIRED'}})});}catch(reason){await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'FAILED',errorMessage:reason instanceof Error?reason.message:String(reason)}}).catch(()=>undefined)}});
}
