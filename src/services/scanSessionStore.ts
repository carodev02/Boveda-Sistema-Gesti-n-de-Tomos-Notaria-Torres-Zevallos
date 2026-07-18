import type {ScanSession} from '../domain/document-domain';
const KEY='sigadn-browser-scan-session-v1';
export function saveBrowserScanSession(session:ScanSession){sessionStorage.setItem(KEY,JSON.stringify(session))}
export function readBrowserScanSession(){try{return JSON.parse(sessionStorage.getItem(KEY)??'null') as ScanSession|null}catch{return null}}
export function clearBrowserScanSession(){sessionStorage.removeItem(KEY)}
