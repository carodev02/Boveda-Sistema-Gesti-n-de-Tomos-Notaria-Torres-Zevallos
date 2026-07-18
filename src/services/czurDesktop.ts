import {invoke} from '@tauri-apps/api/core';
import {listen,type UnlistenFn} from '@tauri-apps/api/event';
import type {CzurConfiguration,PageCorners,ScanSession,ScanUiStatus} from '../domain/document-domain';
import {isTauriEnvironment} from '../utils/environment';

export type DetectedScanFile={id:string;displayName:string;size:number;pageCount:number;detectedAt:string;kind:'PDF'|'IMAGE_GROUP'};
export type ScanStatusEvent={sessionId:string;status:ScanUiStatus;message:string;file?:DetectedScanFile};
const desktopOnly=()=>{if(!isTauriEnvironment())throw new Error('La integración con CZUR está disponible en SIGADN Desktop.')};
const call=<T>(command:string,args?:Record<string,unknown>)=>{desktopOnly();return invoke<T>(command,args)};

export const czurDesktop={
  configuration:()=>call<CzurConfiguration>('get_czur_configuration'),
  detect:()=>call<CzurConfiguration>('detect_czur_scanner'),
  validate:()=>call<CzurConfiguration>('validate_czur_configuration'),
  configureExecutable:()=>call<CzurConfiguration>('configure_czur_executable'),
  configureExportFolder:()=>call<CzurConfiguration>('configure_czur_export_folder'),
  open:()=>call<{openedAt:string}>('open_czur_scanner'),
  startSession:(session:ScanSession)=>call<ScanSession>('start_scan_session',{session}),
  cancelSession:(sessionId:string,removeTemporary:boolean)=>call<void>('cancel_scan_session',{sessionId,removeTemporary}),
  selectDetectedFile:(sessionId:string,fileId:string)=>call<ScanSession>('select_scan_file',{sessionId,fileId}),
  selectManualFile:(sessionId:string)=>call<ScanSession>('select_manual_scan_file',{sessionId}),
  rotatePage:(sessionId:string,pageId:string,degrees:number)=>call<ScanSession>('rotate_scan_page',{sessionId,pageId,degrees}),
  adjustCorners:(sessionId:string,pageId:string,corners:PageCorners)=>call<ScanSession>('adjust_scan_page_corners',{sessionId,pageId,corners}),
  useOriginal:(sessionId:string,pageId:string)=>call<ScanSession>('use_original_scan_page',{sessionId,pageId}),
  redetect:(sessionId:string,pageId:string)=>call<ScanSession>('redetect_scan_page',{sessionId,pageId}),
  updatePages:(sessionId:string,pages:ScanSession['pages'])=>call<ScanSession>('update_scan_pages',{sessionId,pages}),
  generateCleanPdf:(sessionId:string)=>call<ScanSession>('generate_clean_pdf',{sessionId}),
  recoverSessions:()=>call<ScanSession[]>('recover_scan_sessions'),
  onStatus:(handler:(event:ScanStatusEvent)=>void):Promise<UnlistenFn>=>{desktopOnly();return listen<ScanStatusEvent>('scan-session-status',event=>handler(event.payload))},
};
