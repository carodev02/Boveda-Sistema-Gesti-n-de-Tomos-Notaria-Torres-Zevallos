import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import type {CzurConfiguration,PageCorners,ScanSession,ScanUiStatus} from '../domain/document-domain';
import {isTauriEnvironment} from '../utils/environment';

export type DetectedScanFile={id:string;displayName:string;size:number;pageCount:number;detectedAt:string;kind:'PDF'|'IMAGE_GROUP'};
export type ScanStatusEvent={sessionId:string;status:ScanUiStatus;message:string;file?:DetectedScanFile};
export type ScanReadyForPreviewEvent={sessionId:string;pageCount:number;filename:string;sourceType:'CZUR'|'MANUAL'};
export const SCAN_READY_FOR_PREVIEW='SCAN_READY_FOR_PREVIEW';
const desktopOnly=()=>{if(!isTauriEnvironment())throw new Error('La integración con CZUR está disponible en Bóveda Desktop.')};
const call=<T>(command:string,args?:Record<string,unknown>)=>{desktopOnly();return invoke<T>(command,args)};

export const czurDesktop={
  configuration:()=>call<CzurConfiguration>('get_czur_configuration'),
  resetConfiguration:()=>call<CzurConfiguration>('reset_czur_configuration'),
  detect:()=>call<CzurConfiguration>('detect_czur_scanner'),
  detectExportFolder:()=>call<CzurConfiguration>('detect_czur_export_folder'),
  validate:()=>call<CzurConfiguration>('validate_czur_configuration'),
  configureExecutable:()=>call<CzurConfiguration>('configure_czur_executable'),
  configureExportFolder:()=>call<CzurConfiguration>('configure_czur_export_folder'),
  testExportFolder:()=>call<CzurConfiguration>('test_czur_export_folder'),
  open:()=>call<{openedAt:string}>('open_czur_scanner'),
  startSession:(session:ScanSession)=>call<ScanSession>('start_scan_session',{session}),
  cancelSession:(sessionId:string,removeTemporary:boolean)=>call<void>('cancel_scan_session',{sessionId,removeTemporary}),
  completeAcquisition:(sessionId:string)=>call<void>('complete_scan_acquisition',{sessionId}),
  selectDetectedFile:(sessionId:string,fileId:string)=>call<ScanSession>('select_scan_file',{sessionId,fileId}),
  selectManualFile:(session:ScanSession)=>call<ScanSession>('select_manual_scan_file',{session}),
  readOriginal:(sessionId:string)=>call<number[]>('read_scan_original',{sessionId}),
  getSession:(sessionId:string)=>call<ScanSession>('get_scan_session',{sessionId}),
  storeCleanPdf:(sessionId:string,bytes:Uint8Array)=>call<ScanSession>('store_clean_pdf',{sessionId,bytes:Array.from(bytes)}),
  rotatePage:(sessionId:string,pageId:string,degrees:number)=>call<ScanSession>('rotate_scan_page',{sessionId,pageId,degrees}),
  adjustCorners:(sessionId:string,pageId:string,corners:PageCorners)=>call<ScanSession>('adjust_scan_page_corners',{sessionId,pageId,corners}),
  useOriginal:(sessionId:string,pageId:string)=>call<ScanSession>('use_original_scan_page',{sessionId,pageId}),
  redetect:(sessionId:string,pageId:string)=>call<ScanSession>('redetect_scan_page',{sessionId,pageId}),
  updatePages:(sessionId:string,pages:ScanSession['pages'])=>call<ScanSession>('update_scan_pages',{sessionId,pages}),
  generateCleanPdf:(sessionId:string)=>call<ScanSession>('generate_clean_pdf',{sessionId}),
  readCleanPdf:(sessionId:string)=>call<number[]>('read_clean_pdf',{sessionId}),
  readCleanPdfChunk:(sessionId:string,offset:number,length:number)=>call<{size:number;bytes:number[]}>('read_clean_pdf_chunk',{sessionId,offset,length}),
  applyProcessedFilename:(sessionId:string,proposedFilename:string)=>call<string>('apply_processed_filename',{sessionId,proposedFilename}),
  recoverSessions:()=>call<ScanSession[]>('recover_scan_sessions'),
  listSessions:(offset=0,limit=100)=>call<ScanSession[]>('list_scan_sessions',{offset,limit}),
  resumeQueue:()=>call<number>('resume_scan_queue'),
  retrySession:(sessionId:string)=>call<void>('retry_scan_session',{sessionId}),
  onStatus:(handler:(event:ScanStatusEvent)=>void):Promise<UnlistenFn>=>{desktopOnly();return listen<ScanStatusEvent>('scan-session-status',event=>handler(event.payload))},
  onReadyForPreview:(handler:(event:ScanReadyForPreviewEvent)=>void):Promise<UnlistenFn>=>{desktopOnly();return listen<ScanReadyForPreviewEvent>(SCAN_READY_FOR_PREVIEW,event=>handler(event.payload))},
};
