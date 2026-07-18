import {AlertTriangle} from 'lucide-react';

export function ContractorConflictAlert({candidates}:{candidates:string[]}){
  const distinct=[...new Set(candidates.map(value=>value.trim()).filter(Boolean))];
  if(distinct.length<2)return null;
  return <div className="contractorConflictAlert" role="alert"><AlertTriangle size={17}/><div><b>Posible inconsistencia: se detectó más de un contratante principal para este kardex.</b><small>{distinct.join(' · ')}</small></div></div>;
}
