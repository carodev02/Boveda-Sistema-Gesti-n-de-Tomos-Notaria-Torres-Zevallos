import {czurDesktop} from './czurDesktop';
import {apiRequest} from './apiClient';

export type ScanUploadMetadata={sessionId:string;documentClass:string;registryTypeId?:string;tomeNumber?:string;folioRangeStart?:number;folioRangeEnd?:number;year?:number;bienniumStart?:number;bienniumEnd?:number;file?:Blob};
export type ScanUploadResult={uploadId:string;jobId?:string;documentId?:string;status:string;pageCount:number;sha256?:string};
export async function uploadCleanPdfFromSession(metadata:ScanUploadMetadata):Promise<ScanUploadResult>{const blob=metadata.file??new Blob([new Uint8Array(await czurDesktop.readCleanPdf(metadata.sessionId))],{type:'application/pdf'});const form=new FormData();form.append('file',blob,'document-clean.pdf');for(const [key,value] of Object.entries(metadata))if(key!=='file'&&value!==undefined)form.append(key,String(value));return apiRequest<ScanUploadResult>('/documents/uploads/from-scan',{method:'POST',body:form});}
