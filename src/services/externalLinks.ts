import {invoke,isTauri} from '@tauri-apps/api/core';

export async function openExternalUrl(url:string){
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol))throw new Error('El enlace no es una dirección web segura.');
  if(isTauri()){
    await invoke('open_external_url',{url:parsed.toString()});
    return;
  }
  const opened=window.open(parsed.toString(),'_blank','noopener,noreferrer');
  if(!opened)window.location.assign(parsed.toString());
}
