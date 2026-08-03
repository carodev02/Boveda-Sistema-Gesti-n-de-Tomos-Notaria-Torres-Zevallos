import crypto from 'node:crypto';
import type {Prisma} from '@prisma/client';

export type KardexLocation={year?:number;bienniumStart?:number;bienniumEnd?:number;tomeNumber:string};
export function normalizeKardex(value:unknown){let text=String(value??'').normalize('NFC').trim().toUpperCase().replace(/^KARDEX\s*(?:N(?:ÚMERO|UMERO|RO)?[\s.º°]*)?[:.-]?\s*/,'').replace(/[\s_-]+/g,'');if(/^K[0-9O]+$/.test(text))text=text.slice(1);if(/^[0-9O]+$/.test(text))text=text.replace(/O/g,'0').replace(/^0+(?=\d)/,'');return text}
export function kardexPeriodKey(location:KardexLocation){if(location.year)return String(location.year);if(location.bienniumStart&&location.bienniumEnd)return `${location.bienniumStart}-${location.bienniumEnd}`;return 'SIN-PERIODO'}
const kind=(documentType:string)=>/minuta/i.test(documentType)?'MINUTA':'ACTA';
const comparable=(value:unknown)=>String(value??'').normalize('NFC').trim().toLocaleUpperCase('es-PE').replace(/\s+/g,' ');
export function kardexStatusAfterDeletion(documentTypes:string[]){const hasMinuta=documentTypes.some(value=>kind(value)==='MINUTA');const hasActa=documentTypes.some(value=>kind(value)==='ACTA');return hasMinuta&&hasActa?'Relación completa':hasMinuta?'Falta Escritura':hasActa?'Falta Minuta':'Inactivo'}
export async function refreshKardexCaseAfterDeletion(tx:Prisma.TransactionClient,kardexCaseId:string){const active=await tx.document.findMany({where:{kardexCaseId,deletedAt:null,documentStatus:{not:'DELETED'}},select:{documentType:true}});const status=kardexStatusAfterDeletion(active.map(item=>item.documentType));await tx.kardexCase.update({where:{id:kardexCaseId},data:{status}});return status}

export async function associateKardexCase(tx:Prisma.TransactionClient,input:{documentId:string;kardex:unknown;documentType:string;year?:number;bienniumStart?:number;bienniumEnd?:number;tomeNumber:string;legalAct?:string;primaryContractor?:string}){
  const normalizedKardex=normalizeKardex(input.kardex);if(!normalizedKardex)throw new Error('El Kardex debe confirmarse antes de registrar el documento.');
  const periodKey=kardexPeriodKey(input);const tomeNumber=String(input.tomeNumber??'').trim()||'SIN-TOMO';
  const sameNumberElsewhere=await tx.kardexCase.findFirst({where:{normalizedKardex,NOT:{periodKey,tomeNumber},documents:{some:{deletedAt:null,documentStatus:'CONFIRMED'}}}});
  const activeDocuments={where:{deletedAt:null,documentStatus:'CONFIRMED' as const}};
  let kardexCase=await tx.kardexCase.findUnique({where:{normalizedKardex_periodKey_tomeNumber:{normalizedKardex,periodKey,tomeNumber}},include:{documents:activeDocuments}});
  const documentKind=kind(input.documentType);const hasMinuta=kardexCase?.documents.some(item=>kind(item.documentType)==='MINUTA')??false;const hasActa=kardexCase?.documents.some(item=>kind(item.documentType)==='ACTA')??false;
  const duplicateMinuta=documentKind==='MINUTA'&&hasMinuta;const contractorConflict=Boolean(kardexCase?.primaryContractor&&input.primaryContractor&&comparable(kardexCase.primaryContractor)!==comparable(input.primaryContractor));
  const nextHasMinuta=hasMinuta||documentKind==='MINUTA';const nextHasActa=hasActa||documentKind==='ACTA';
  const status=duplicateMinuta?'Conflicto':sameNumberElsewhere||contractorConflict?'Requiere revisión':nextHasMinuta&&nextHasActa?'Relación completa':nextHasMinuta?'Solo Minuta':'Solo Acta';
  if(!kardexCase)kardexCase=await tx.kardexCase.create({data:{id:crypto.randomUUID(),normalizedKardex,periodKey,year:input.year,bienniumStart:input.bienniumStart,bienniumEnd:input.bienniumEnd,tomeNumber,legalAct:documentKind==='MINUTA'?input.legalAct:undefined,primaryContractor:documentKind==='MINUTA'?input.primaryContractor:undefined,status},include:{documents:activeDocuments}});
  else kardexCase=await tx.kardexCase.update({where:{id:kardexCase.id},data:{status,...(documentKind==='MINUTA'&&!duplicateMinuta?{legalAct:input.legalAct,primaryContractor:input.primaryContractor}: {})},include:{documents:activeDocuments}});
  await tx.document.update({where:{id:input.documentId},data:{kardex:normalizedKardex,kardexCaseId:kardexCase.id}});
  return {caseId:kardexCase.id,normalizedKardex,status,locationConflict:Boolean(sameNumberElsewhere),duplicateMinuta,contractorConflict};
}
