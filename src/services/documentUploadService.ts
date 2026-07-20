import {czurDesktop} from './czurDesktop';
import {apiRequest} from './apiClient';

export type ScanUploadMetadata={sessionId?:string;documentClass:string;registryTypeId?:string;tomeNumber?:string;folioRangeStart?:number;folioRangeEnd?:number;year?:number;bienniumStart?:number;bienniumEnd?:number;file?:Blob};
export type ScanUploadResult={uploadId:string;jobId?:string;documentId?:string;status:string;pageCount:number;sha256?:string};
const trace=(message:string,detail?:unknown)=>{if(import.meta.env.DEV)console.debug(`[PROCESS] ${message}`,detail??'')};
const timeout=<T>(promise:Promise<T>,milliseconds:number,message:string)=>new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),milliseconds);promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
function toBytes(value:unknown){if(value instanceof Uint8Array)return value;if(Array.isArray(value))return Uint8Array.from(value);if(value&&typeof value==='object'&&Array.isArray((value as {data?:unknown}).data))return Uint8Array.from((value as {data:number[]}).data);throw new Error('No se pudo leer el PDF preparado.')}
export async function uploadCleanPdfFromSession(metadata:ScanUploadMetadata):Promise<ScanUploadResult>{
  trace('Leyendo PDF limpio');
  let blob:Blob;
  if(metadata.file)blob=metadata.file;
  else{
    if(!metadata.sessionId)throw new Error('No se pudo leer el PDF preparado.');
    const raw=await timeout(czurDesktop.readCleanPdf(metadata.sessionId),15000,'No se pudo leer el PDF preparado.');
    const bytes=toBytes(raw);const copy=new Uint8Array(bytes.length);copy.set(bytes);
    blob=new Blob([copy.buffer],{type:'application/pdf'});
  }
  const signature=new TextDecoder('ascii').decode(new Uint8Array(await blob.slice(0,5).arrayBuffer()));
  trace(`Bytes recibidos: ${blob.size}`);
  if(!blob.size||signature!=='%PDF-')throw new Error('No se pudo leer el PDF preparado.');
  const form=new FormData();form.append('file',blob,'document-clean.pdf');for(const [key,value] of Object.entries(metadata))if(key!=='file'&&value!==undefined)form.append(key,String(value));
  trace('Iniciando upload multipart');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{return await apiRequest<ScanUploadResult>('/documents/uploads/from-scan',{method:'POST',body:form,signal:controller.signal})}finally{clearTimeout(timer)}
}
