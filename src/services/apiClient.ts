import {invoke,isTauri} from '@tauri-apps/api/core';
import {fetch as tauriFetch} from '@tauri-apps/plugin-http';

const COMPILED_API_URL=(import.meta.env.VITE_API_URL as string|undefined)?.replace(/\/$/,'');
let resolvedApiUrl:Promise<string>|undefined;
export const normalizeServerUrl=(value:string)=>{const clean=value.trim().replace(/\/$/,'');return clean.endsWith('/api')?clean:`${clean}/api`};
async function getApiUrl(){
  if(isTauri()){
    resolvedApiUrl??=invoke<string|null>('get_server_url').then(value=>value?normalizeServerUrl(value):'/api').catch(()=>'/api');
    return resolvedApiUrl;
  }
  return COMPILED_API_URL??'/api';
}
const TOKEN_KEY='sigadn-session-token';

export class ApiError extends Error{constructor(message:string,public status:number,public responseBody:unknown){super(message)}}

export const sessionToken={get:()=>typeof localStorage==='undefined'?null:localStorage.getItem(TOKEN_KEY),set:(token:string)=>{if(typeof localStorage!=='undefined')localStorage.setItem(TOKEN_KEY,token)},clear:()=>{if(typeof localStorage!=='undefined')localStorage.removeItem(TOKEN_KEY)}};

export async function apiResponse(path:string,options:RequestInit={}){
  const apiUrl=await getApiUrl();const url=`${apiUrl}${path}`;const isMultipart=typeof FormData!=='undefined'&&options.body instanceof FormData;const token=sessionToken.get();let response:Response;
  const transport=isTauri()&&/^https?:\/\//.test(apiUrl)?tauriFetch:globalThis.fetch;
  try{response=await transport(url,{...options,credentials:'include',headers:{...(options.body&&!isMultipart?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`} :{}),...options.headers}})}
  catch(cause){const detail=cause instanceof Error?cause.message:String(cause);throw new ApiError(`No se pudo conectar con el servidor central. Detalle: ${detail}`,0,{url,detail})}
  if(import.meta.env.DEV&&path.startsWith('/documents/'))console.debug(`[PROCESS] HTTP ${options.method??'GET'} ${path}: ${response.status}`);
  if(!response.ok){const data=await response.clone().json().catch(()=>({})) as {error?:string};const detail={method:options.method??'GET',url,status:response.status,responseBody:data};if(import.meta.env.DEV)console.error('[Bóveda API]',detail);throw new ApiError(data.error??'No fue posible completar la operación.',response.status,data)}
  return response;
}

export async function apiRequest<T>(path:string,options:RequestInit={}){
  const response=await apiResponse(path,options);
  if(response.status===204)return undefined as T;
  return await response.json().catch(()=>({})) as T;
}
