import {prisma} from '../config/prisma.js';
import {associateKardexCase,normalizeKardex,refreshKardexCaseAfterDeletion} from './kardex-case.service.js';

export type ReconciliationRow={id:string;kardex:string|null;documentType:string;year:number|null;bienniumStart:number|null;bienniumEnd:number|null;tomo:string;actoJuridico:string|null;kardexCaseId:string|null;contractors:Array<{name:string;position:number}>};
const activeRows=()=>prisma.document.findMany({where:{deletedAt:null,documentStatus:'CONFIRMED'},select:{id:true,kardex:true,documentType:true,year:true,bienniumStart:true,bienniumEnd:true,tomo:true,actoJuridico:true,kardexCaseId:true,contractors:{select:{name:true,position:true},orderBy:{position:'asc'}}},orderBy:{createdAt:'desc'}});
export function preferredKardexTome(rows:ReconciliationRow[]){return rows.find(row=>!/minuta/i.test(row.documentType)&&row.tomo.trim())?.tomo.trim()??rows.find(row=>row.tomo.trim())?.tomo.trim()??''}

async function alignRows(rows:ReconciliationRow[],targetTome:string){
 const changed=rows.filter(row=>row.tomo!==targetTome).length;if(!changed)return 0;
 await prisma.$transaction(async tx=>{
  const oldCases=[...new Set(rows.map(row=>row.kardexCaseId).filter((value):value is string=>Boolean(value)))];
  await tx.document.updateMany({where:{id:{in:rows.map(row=>row.id)}},data:{tomo:targetTome,kardexCaseId:null}});
  for(const caseId of oldCases)await refreshKardexCaseAfterDeletion(tx,caseId);
  for(const row of rows){const originalKardex=row.kardex;await associateKardexCase(tx,{documentId:row.id,kardex:row.kardex,documentType:row.documentType,year:row.year??undefined,bienniumStart:row.bienniumStart??undefined,bienniumEnd:row.bienniumEnd??undefined,tomeNumber:targetTome,legalAct:row.actoJuridico??undefined,primaryContractor:row.contractors[0]?.name});await tx.document.update({where:{id:row.id},data:{kardex:originalKardex}})}
 });
 return changed;
}

export async function alignKardexDocumentsToTome(kardexValue:unknown,targetTome:string){const normalized=normalizeKardex(kardexValue);if(!normalized||!targetTome.trim())return 0;const rows=(await activeRows()).filter(row=>normalizeKardex(row.kardex)===normalized);return alignRows(rows,targetTome.trim())}
export async function moveTomeDocuments(year:number,currentTome:string,newTome:string){const rows=(await activeRows()).filter(row=>row.year===year&&row.tomo===currentTome);if(!rows.length)return 0;return alignRows(rows,newTome)}
export async function moveDocumentType(year:number,tome:string,currentType:string,newType:string){const rows=(await activeRows()).filter(row=>row.year===year&&row.tomo===tome&&row.documentType===currentType);if(!rows.length)return 0;await prisma.$transaction(async tx=>{const oldCases=[...new Set(rows.map(row=>row.kardexCaseId).filter((value):value is string=>Boolean(value)))];await tx.document.updateMany({where:{id:{in:rows.map(row=>row.id)}},data:{documentType:newType,kardexCaseId:null}});for(const caseId of oldCases)await refreshKardexCaseAfterDeletion(tx,caseId);for(const row of rows){const originalKardex=row.kardex;await associateKardexCase(tx,{documentId:row.id,kardex:row.kardex,documentType:newType,year:row.year??undefined,bienniumStart:row.bienniumStart??undefined,bienniumEnd:row.bienniumEnd??undefined,tomeNumber:row.tomo,legalAct:row.actoJuridico??undefined,primaryContractor:row.contractors[0]?.name});await tx.document.update({where:{id:row.id},data:{kardex:originalKardex}})}});return rows.length}
export async function reconcileKardexTomeConflicts(){const groups=new Map<string,ReconciliationRow[]>();for(const row of await activeRows()){const key=normalizeKardex(row.kardex);if(key)groups.set(key,[...(groups.get(key)??[]),row])}let changed=0;for(const rows of groups.values()){if(new Set(rows.map(row=>row.tomo)).size<2)continue;const target=preferredKardexTome(rows);if(target)changed+=await alignRows(rows,target)}return changed}
