import {useCallback,useEffect,useState} from 'react';
import {getDocuments,type DocumentRecord} from '../data/repository';

const newestFirst=(records:DocumentRecord[])=>records.sort((a,b)=>new Date(b.fechaRegistro).getTime()-new Date(a.fechaRegistro).getTime());
export function useDocuments(includeDeleted=false){
 const [documents,setDocuments]=useState<DocumentRecord[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string>();
 const refresh=useCallback(async()=>{setLoading(true);setError(undefined);try{setDocuments(newestFirst(await getDocuments(includeDeleted)))}catch(reason){setError(reason instanceof Error?reason.message:'No se pudieron cargar los documentos.')}finally{setLoading(false)}},[includeDeleted]);
 useEffect(()=>{let active=true;getDocuments(includeDeleted).then(records=>{if(active)setDocuments(newestFirst(records))}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'No se pudieron cargar los documentos.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[includeDeleted]);
 useEffect(()=>{const changed=()=>void refresh();window.addEventListener('boveda:documents-changed',changed);return()=>window.removeEventListener('boveda:documents-changed',changed)},[refresh]);
 return {documents,loading,error,refresh};
}
