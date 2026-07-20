import {useSyncExternalStore} from 'react';
import type {ScanConfiguration,ScanPage,ScanSession} from '../domain/document-domain';
import type {DetectedScanFile} from './czurDesktop';

export type ScanWorkflowState={configuration?:ScanConfiguration;sessionId?:string;sessionStatus?:string;originalFilename?:string;pageCount:number;pages:ScanPage[];selectedPageId?:string;detectedFiles:DetectedScanFile[];cleanPdfReady:boolean;processingError?:string;uploadId?:string;documentId?:string;ocrJobId?:string;uploadStatus?:string;ocrStatus?:string;uploadError?:string;ocrError?:string;ocrPages?:unknown[];extractedFields?:unknown[];reviewCount?:number};
const initial:ScanWorkflowState={pageCount:0,pages:[],detectedFiles:[],cleanPdfReady:false};let state=initial;const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());
export const scanWorkflowStore={
 get:()=>state,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},
 setConfiguration:(configuration:ScanConfiguration)=>{state={...state,configuration};emit()},
 setSession:(session:ScanSession)=>{state={...state,sessionId:session.id,sessionStatus:session.status,originalFilename:session.originalFileName,pageCount:session.pageCount,pages:session.pages,selectedPageId:session.pages[0]?.id,cleanPdfReady:Boolean(session.cleanPdfPath),processingError:session.error??undefined};emit()},
 setPages:(pages:ScanPage[])=>{state={...state,pages,pageCount:pages.length,selectedPageId:state.selectedPageId??pages[0]?.id};emit()},
 updatePage:(page:ScanPage)=>{state={...state,pages:state.pages.map(item=>item.id===page.id?page:item)};emit()},
 selectPage:(id:string)=>{state={...state,selectedPageId:id};emit()},
 reorderPages:(pages:ScanPage[])=>{state={...state,pages};emit()},
 excludePage:(id:string)=>{state={...state,pages:state.pages.map(page=>page.id===id?{...page,excluded:true}:page)};emit()},
 restorePage:(id:string)=>{state={...state,pages:state.pages.map(page=>page.id===id?{...page,excluded:false}:page)};emit()},
 setDetectedFiles:(detectedFiles:DetectedScanFile[])=>{state={...state,detectedFiles};emit()},
 setError:(processingError?:string)=>{state={...state,processingError};emit()},
 setUploadResult:(result:{uploadId:string;documentId?:string;status:string})=>{state={...state,uploadId:result.uploadId,documentId:result.documentId,uploadStatus:result.status,uploadError:undefined};emit()},
 setOcrJob:(jobId:string,status?:string)=>{state={...state,ocrJobId:jobId,ocrStatus:status??'QUEUED',ocrError:undefined};emit()},
 setOcrResults:(result:{pages:unknown[];fields:unknown[];reviewCount:number})=>{state={...state,ocrPages:result.pages,extractedFields:result.fields,reviewCount:result.reviewCount,ocrStatus:'REVIEW_REQUIRED'};emit()},
 setUploadError:(uploadError?:string)=>{state={...state,uploadError};emit()},
 resetProcessingState:()=>{state={...state,uploadId:undefined,documentId:undefined,ocrJobId:undefined,uploadStatus:undefined,ocrStatus:undefined,uploadError:undefined,ocrError:undefined};emit()},
 resetWorkflow:()=>{state=initial;emit()},
 recoverSession:(session:ScanSession)=>scanWorkflowStore.setSession(session),
};
export function useScanWorkflow(){return useSyncExternalStore(scanWorkflowStore.subscribe,scanWorkflowStore.get,scanWorkflowStore.get)}
