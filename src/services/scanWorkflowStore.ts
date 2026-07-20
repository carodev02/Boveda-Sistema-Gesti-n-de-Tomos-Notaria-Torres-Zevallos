import {useSyncExternalStore} from 'react';
import type {ScanConfiguration,ScanPage,ScanSession} from '../domain/document-domain';
import type {DetectedScanFile} from './czurDesktop';

export type AcquisitionMode='IDLE'|'CZUR'|'MANUAL';
export type AcquisitionStatus='IDLE'|'STARTING'|'WAITING_FOR_FILE'|'FILE_DETECTED'|'PREPARING'|'READY_FOR_PREVIEW'|'FAILED'|'CANCELLED'|'COMPLETED';
export type ScanWorkflowState={acquisitionMode:AcquisitionMode;acquisitionStatus:AcquisitionStatus;acquisitionSessionId?:string;configuration?:ScanConfiguration;sessionId?:string;sessionStatus?:string;originalFilename?:string;pageCount:number;pages:ScanPage[];selectedPageId?:string;detectedFiles:DetectedScanFile[];cleanPdfReady:boolean;processingError?:string;uploadId?:string;documentId?:string;ocrJobId?:string;uploadStatus?:string;ocrStatus?:string;currentStage?:string;processedPages?:number;totalPages?:number;progress?:number;processingErrorCode?:string;uploadError?:string;ocrError?:string;ocrPages?:unknown[];extractedFields?:unknown[];confirmedFields?:unknown[];reviewFields?:unknown[];reviewCount?:number;documentLocation?:Record<string,unknown>;documentClass?:string};
const initial:ScanWorkflowState={acquisitionMode:'IDLE',acquisitionStatus:'IDLE',pageCount:0,pages:[],detectedFiles:[],cleanPdfReady:false};let state=initial;const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(listener=>listener());
export const scanWorkflowStore={
 get:()=>state,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},
 beginAcquisition:(mode:Exclude<AcquisitionMode,'IDLE'>,sessionId?:string)=>{if(state.acquisitionMode!=='IDLE')return false;state={...state,acquisitionMode:mode,acquisitionStatus:'STARTING',acquisitionSessionId:sessionId};emit();return true},
 setAcquisitionStatus:(acquisitionStatus:AcquisitionStatus,acquisitionSessionId=state.acquisitionSessionId)=>{state={...state,acquisitionStatus,acquisitionSessionId};emit()},
 recoverAcquisition:(mode:Exclude<AcquisitionMode,'IDLE'>,status:AcquisitionStatus,sessionId:string)=>{if(state.acquisitionMode==='IDLE'){state={...state,acquisitionMode:mode,acquisitionStatus:status,acquisitionSessionId:sessionId};emit()}},
 finishAcquisition:(status:'COMPLETED'|'CANCELLED'|'FAILED')=>{state={...state,acquisitionMode:'IDLE',acquisitionStatus:status,acquisitionSessionId:undefined};emit()},
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
 setProcessingProgress:(result:{status:string;currentStage?:string;processedPages?:number;totalPages?:number;progress?:number;errorCode?:string;error?:string|null})=>{state={...state,ocrStatus:result.status,currentStage:result.currentStage,processedPages:result.processedPages,totalPages:result.totalPages,progress:result.progress,ocrError:result.error??undefined,processingErrorCode:result.errorCode};emit()},
 setProcessingFailure:(code:string,message?:string)=>{state={...state,ocrStatus:'FAILED',processingErrorCode:code,ocrError:message};emit()},
 clearOcrJob:()=>{state={...state,ocrJobId:undefined,ocrStatus:undefined,currentStage:'PREPARING',processedPages:undefined,progress:undefined,processingErrorCode:undefined,ocrError:undefined};emit()},
 setOcrResults:(result:{pages:unknown[];fields:unknown[];confirmedFields?:unknown[];reviewFields?:unknown[];reviewCount:number;documentLocation?:Record<string,unknown>;location?:Record<string,unknown>;documentClass?:string},status='REVIEW_REQUIRED')=>{const fields=result.fields.length?result.fields:[...(result.confirmedFields??[]),...(result.reviewFields??[])];state={...state,ocrPages:result.pages,extractedFields:fields,confirmedFields:result.confirmedFields??[],reviewFields:result.reviewFields??[],reviewCount:result.reviewCount,documentLocation:result.documentLocation??result.location,documentClass:result.documentClass,ocrStatus:status,currentStage:status};emit()},
 setUploadError:(uploadError?:string)=>{state={...state,uploadError};emit()},
 resetProcessingState:()=>{state={...state,uploadId:undefined,documentId:undefined,ocrJobId:undefined,uploadStatus:undefined,ocrStatus:undefined,currentStage:undefined,processedPages:undefined,totalPages:undefined,progress:undefined,processingErrorCode:undefined,uploadError:undefined,ocrError:undefined};emit()},
 resetWorkflow:()=>{state={...initial,acquisitionMode:state.acquisitionMode,acquisitionStatus:state.acquisitionStatus,acquisitionSessionId:state.acquisitionSessionId};emit()},
 recoverSession:(session:ScanSession)=>scanWorkflowStore.setSession(session),
};
export function useScanWorkflow(){return useSyncExternalStore(scanWorkflowStore.subscribe,scanWorkflowStore.get,scanWorkflowStore.get)}
