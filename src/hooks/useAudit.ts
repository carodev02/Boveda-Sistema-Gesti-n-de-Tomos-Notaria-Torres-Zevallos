import {useCallback,useEffect,useState} from 'react';import {getAudit,type AuditRecord} from '../data/repository';
export function useAudit(){const [records,setRecords]=useState<AuditRecord[]>([]);const [loading,setLoading]=useState(true);const refresh=useCallback(async()=>{const values=await getAudit();setRecords(values.reverse());setLoading(false)},[]);useEffect(()=>{let active=true;getAudit().then(values=>{if(active){setRecords(values.reverse());setLoading(false)}});return()=>{active=false}},[]);return {records,loading,refresh}}

