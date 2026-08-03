import {apiRequest} from './apiClient';
export type CentralSettings={documentTypes:string;legalActs:string;ocrThreshold:number;ocrLanguage:string;retries:number;automaticClassification:boolean;aiEnabled:boolean;institutionName:string;email:string;address:string;passwordLength:number;failedAttempts:number};
export const settingsApi={get:()=>apiRequest<CentralSettings>('/settings'),save:(value:CentralSettings)=>apiRequest<CentralSettings>('/settings',{method:'PUT',body:JSON.stringify(value)})};
export async function addAudit(_action?:string,_module?:string,_detail?:string){void _action;void _module;void _detail;const raw=localStorage.getItem('sigadn-settings');if(raw)await settingsApi.save(JSON.parse(raw) as CentralSettings);}
