import type {DocumentRecord} from '../data/repository';
import {sanitizeDisplayText} from '../utils/displayText';

export type TomeDocument={document:DocumentRecord;label:string;requiresReview:boolean};
export type TomeCategory={name:string;documents:TomeDocument[]};
export type TomeGroup={key:string;label:string;sortValue:number;categories:TomeCategory[]};
export type PeriodGroup={key:string;label:string;sortValue:number;tomes:TomeGroup[]};

const definitive=new Set(['CONFIRMED','READY','ARCHIVED','VALIDADO']);
const clean=(value:unknown)=>sanitizeDisplayText(value);
const numberFrom=(value:unknown)=>{const match=clean(value).match(/\d+/);return match?Number(match[0]):Number.MAX_SAFE_INTEGER};
const category=(document:DocumentRecord)=>{const type=clean(document.tipo);if(/minuta/i.test(type))return 'Minuta';if(/acta/i.test(type))return 'Acta';return type||'Requiere revisión'};
const name=(document:DocumentRecord,type:string)=>{const kardex=clean(document.kardex);if(type==='Minuta')return kardex?`K-${kardex}.pdf`:'DOCUMENTO - REVISAR.pdf';if(type==='Acta'){const contractor=clean(document.contratantes[0]);if(contractor&&kardex)return `${contractor} - KARDEX ${kardex}.pdf`;if(kardex)return `KARDEX ${kardex} - ACTA - REVISAR.pdf`}return clean(document.fileName)||'DOCUMENTO - REVISAR.pdf'};
const period=(document:DocumentRecord)=>{const start=document.bienniumStart;const end=document.bienniumEnd;if(start&&end)return {key:`biennium:${start}-${end}`,label:`Bienio ${start}-${end}`,sortValue:end};if(document.bienio){const match=document.bienio.match(/^(\d{4})\s*[-–]\s*(\d{4})$/);if(match)return {key:`biennium:${match[1]}-${match[2]}`,label:`Bienio ${match[1]}-${match[2]}`,sortValue:Number(match[2])}}if(document.ano)return {key:`year:${document.ano}`,label:`Año ${document.ano}`,sortValue:document.ano};return {key:'period:unknown',label:'Período sin identificar',sortValue:-1}};

export function buildTomeHierarchy(documents:DocumentRecord[]):PeriodGroup[]{
  const periods=new Map<string,{label:string;sortValue:number;documents:DocumentRecord[]}>();
  for(const document of documents){if(!definitive.has(clean(document.documento).toLocaleUpperCase('es-PE')))continue;const value=period(document);const group=periods.get(value.key)??{label:value.label,sortValue:value.sortValue,documents:[]};group.documents.push(document);periods.set(value.key,group)}
  return [...periods.entries()].map(([key,value])=>{const tomes=new Map<string,DocumentRecord[]>();for(const document of value.documents){const code=clean(document.tomo);const tomeKey=code||'unknown';tomes.set(tomeKey,[...(tomes.get(tomeKey)??[]),document])}return {key,label:value.label,sortValue:value.sortValue,tomes:[...tomes.entries()].map(([tomeKey,rows])=>{const categories=new Map<string,TomeDocument[]>();for(const document of rows){const type=category(document);const requiresReview=!clean(document.kardex)||!clean(document.tomo)||(!document.ano&&!document.bienio&&!document.bienniumStart);categories.set(type,[...(categories.get(type)??[]),{document,label:name(document,type),requiresReview}])}return {key:`${key}/tome:${tomeKey}`,label:tomeKey==='unknown'?'Tomo sin identificar':`Tomo ${tomeKey}`,sortValue:numberFrom(tomeKey),categories:[...categories.entries()].map(([categoryName,items])=>({name:categoryName,documents:items.sort((a,b)=>a.label.localeCompare(b.label,'es'))})).sort((a,b)=>['Acta','Minuta'].indexOf(a.name)-['Acta','Minuta'].indexOf(b.name))}}).sort((a,b)=>a.sortValue-b.sortValue||a.label.localeCompare(b.label,'es'))}}).sort((a,b)=>b.sortValue-a.sortValue||b.label.localeCompare(a.label,'es'));
}
