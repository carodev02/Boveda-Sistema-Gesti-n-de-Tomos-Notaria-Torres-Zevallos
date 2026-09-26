import type {DocumentRecord} from '../data/repository';
import {sanitizeDisplayText} from './displayText';

export const dashboardTypeKey=(value:unknown)=>sanitizeDisplayText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/\s+/g,' ').trim();
export function dashboardDocumentTypeCounts(documents:Pick<DocumentRecord,'tipo'>[]){const grouped=new Map<string,{label:string,count:number}>();for(const document of documents){const label=sanitizeDisplayText(document.tipo).replace(/\s+/g,' ').trim()||'Sin clasificar';const key=dashboardTypeKey(label);const current=grouped.get(key);if(current)current.count+=1;else grouped.set(key,{label,count:1})}return [...grouped.values()].map(({label,count})=>[label,count] as const)}
const statusKey=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,'_');
export const needsDocumentReview=(document:Pick<DocumentRecord,'documento'|'ocr'>)=>['PENDING','PENDIENTE','EN_REVISION','REVIEW_REQUIRED'].includes(statusKey(document.documento))||statusKey(document.ocr)==='REVIEW_REQUIRED';
export const lacksOcrProcessing=(document:Pick<DocumentRecord,'ocr'>)=>['','NO_PROCESADO','OCR_PENDING','PENDING','UPLOADED'].includes(statusKey(document.ocr));
export const hasProcessingError=(document:Pick<DocumentRecord,'ocr'>)=>['ERROR','FAILED','FALLIDO','OCR_FAILED'].includes(statusKey(document.ocr));
export function wasRegisteredToday(value:unknown,now=new Date()){const date=new Date(String(value??''));return !Number.isNaN(date.getTime())&&date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate()}
