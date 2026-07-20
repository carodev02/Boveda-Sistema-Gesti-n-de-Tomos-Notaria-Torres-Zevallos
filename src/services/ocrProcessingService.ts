import {apiRequest} from './apiClient';
export type OcrJobStartResponse={jobId:string;status:string};
export type OcrJobStatus={jobId:string;status:string;currentStage?:string;totalPages?:number;processedPages?:number;progress?:number;error?:string|null};
export type OcrJobResults={documentClass?:string;location?:Record<string,unknown>;pages:unknown[];fields:Array<{fieldName:string;normalizedValue?:string;extractedValue?:string;confidence?:number;requiresReview?:boolean;pageNumber?:number;sourceText?:string}>;reviewCount:number};
export const ocrProcessingService={start:(uploadId:string)=>apiRequest<OcrJobStartResponse>(`/documents/${uploadId}/ocr/start`,{method:'POST',body:JSON.stringify({})}),status:(jobId:string)=>apiRequest<OcrJobStatus>(`/documents/${jobId}/job`),results:(jobId:string)=>apiRequest<OcrJobResults>(`/documents/document-processing-jobs/${jobId}/results`)};
