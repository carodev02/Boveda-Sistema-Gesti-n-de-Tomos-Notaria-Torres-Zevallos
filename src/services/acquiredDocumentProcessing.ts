import {uploadCleanPdfFromSession,type ScanUploadMetadata,type ScanUploadResult} from './documentUploadService';
import {ocrProcessingService} from './ocrProcessingService';

export type AcquiredSourceType='CZUR'|'MANUAL';
export type AcquiredProcessingState={uploadId?:string;documentId?:string;uploadStatus?:string;ocrJobId?:string;ocrStatus?:string};
const trace=(message:string)=>{if(import.meta.env.DEV)console.debug(message)};

export async function processAcquiredDocument(input:{sessionId?:string;sourceType:AcquiredSourceType;metadata:Omit<ScanUploadMetadata,'sessionId'>;state:AcquiredProcessingState;signal?:AbortSignal}){
  trace(`[SCAN] Fuente: ${input.sourceType}`);
  trace(`[SCAN] sessionId: ${input.sessionId?.slice(0,8)??'sesión web'}`);
  if(!input.metadata.file&&!input.sessionId)throw new Error('CLEAN_PDF_SESSION_MISMATCH: El PDF limpio no pertenece a una sesión activa.');
  trace('[SCAN] PDF limpio listo');
  const upload:ScanUploadResult=input.state.uploadId
    ? {uploadId:input.state.uploadId,documentId:input.state.documentId,status:input.state.uploadStatus??'UPLOADED',pageCount:0}
    : await uploadCleanPdfFromSession({...input.metadata,sessionId:input.sessionId});
  trace(`[OCR] uploadId: ${upload.uploadId.slice(0,8)}`);
  let job:{jobId:string;status:string};
  try{job=input.state.ocrJobId
    ? {jobId:input.state.ocrJobId,status:input.state.ocrStatus??'OCR_PENDING'}
    : await ocrProcessingService.start(upload.uploadId,input.signal)}
  catch(error){throw new Error(`OCR_START_FAILED: ${error instanceof Error?error.message:'No se pudo iniciar el OCR.'}`,{cause:error})}
  trace(`[OCR] jobId: ${job.jobId.slice(0,8)}`);
  return {upload,job};
}
