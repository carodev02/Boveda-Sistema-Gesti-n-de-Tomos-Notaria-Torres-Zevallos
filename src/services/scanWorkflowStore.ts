import {useSyncExternalStore} from 'react';
import type {ScanConfiguration,ScanPage,ScanSession} from '../domain/document-domain';
import type {DetectedScanFile} from './czurDesktop';

export type ScanWorkflowState={configuration?:ScanConfiguration;sessionId?:string;sessionStatus?:string;originalFilename?:string;pageCount:number;pages:ScanPage[];selectedPageId?:string;detectedFiles:DetectedScanFile[];cleanPdfReady:boolean;processingError?:string};
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
 resetWorkflow:()=>{state=initial;emit()},
 recoverSession:(session:ScanSession)=>scanWorkflowStore.setSession(session),
};
export function useScanWorkflow(){return useSyncExternalStore(scanWorkflowStore.subscribe,scanWorkflowStore.get,scanWorkflowStore.get)}
