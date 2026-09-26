import type {DocumentRecord} from '../data/repository';
import {sanitizeDisplayText} from '../utils/displayText';

export type TomeDocument={document:DocumentRecord;label:string;exactFolio?:number;requiresReview:boolean};
export type TomeCategory={name:string;sourceTypes:string[];documents:TomeDocument[]};
export type TomeKardex={key:string;label:string;sortValue:string;status:string;categories:TomeCategory[]};
export type TomeGroup={key:string;label:string;value:string;sortValue:number;kardexCases:TomeKardex[]};
export type TomePeriodScope={year?:number;bienniumStart?:number;bienniumEnd?:number};
export type PeriodGroup={key:string;label:string;sortValue:number;scope?:TomePeriodScope;tomes:TomeGroup[]};

const definitive=new Set(['CONFIRMED','CONFIRMADO','ARCHIVED','VALIDADO']);
const clean=(value:unknown)=>sanitizeDisplayText(value);

export function normalizeKardex(value:unknown){
 let text=clean(value).toUpperCase().replace(/^KARDEX\s*(?:N(?:ÚMERO|UMERO|RO)?[\s.º°]*)?[:.-]?\s*/,'').replace(/[\s_-]+/g,'');
 if(/^K[0-9O]+$/.test(text))text=text.slice(1);
 if(/^[0-9O]+$/.test(text))text=text.replace(/O/g,'0').replace(/^0+(?=\d)/,'');
 return text;
}

const numberFrom=(value:unknown)=>{const match=clean(value).match(/\d+/);return match?Number(match[0]):Number.MAX_SAFE_INTEGER};
const category=(document:DocumentRecord)=>clean(document.tipo)||'Requiere revisión';
const compareCategories=(a:string,b:string)=>a==='Minuta'?-1:b==='Minuta'?1:a.localeCompare(b,'es',{numeric:true});
const filename=(document:DocumentRecord,type:string)=>{
 const current=clean(document.fileName);
 const kardex=normalizeKardex(document.normalizedKardex??document.kardex);
 if(type==='Minuta')return /^K-[^.]+(?: \(\d+\))?\.pdf$/i.test(current)?current:kardex?`K-${kardex}.pdf`:'DOCUMENTO - REVISAR.pdf';
 return current||'DOCUMENTO - REVISAR.pdf';
};
const period=(document:DocumentRecord)=>{
 if(document.bienniumStart&&document.bienniumEnd)return {key:`biennium:${document.bienniumStart}-${document.bienniumEnd}`,label:`Bienio ${document.bienniumStart}-${document.bienniumEnd}`,sortValue:document.bienniumEnd,scope:{bienniumStart:document.bienniumStart,bienniumEnd:document.bienniumEnd}};
 if(document.ano)return {key:`year:${document.ano}`,label:`Año ${document.ano}`,sortValue:document.ano,scope:{year:document.ano}};
 return {key:'period:unknown',label:'Período sin identificar',sortValue:-1,scope:undefined};
};

export function buildTomeHierarchy(documents:DocumentRecord[]):PeriodGroup[]{
 const unique=new Map<string,DocumentRecord>();
 for(const document of documents)unique.set(document.backendId??String(document.id),document);
 const periods=new Map<string,{label:string;sortValue:number;scope?:TomePeriodScope;documents:DocumentRecord[]}>();
 for(const document of unique.values()){
  if(!definitive.has(clean(document.documento).toUpperCase())||document.deletedAt)continue;
  const value=period(document);
  const group=periods.get(value.key)??{label:value.label,sortValue:value.sortValue,scope:value.scope,documents:[]};
  group.documents.push(document);
  periods.set(value.key,group);
 }
 return [...periods.entries()].map(([periodKey,value])=>{
  const tomes=new Map<string,DocumentRecord[]>();
  for(const document of value.documents){const tome=clean(document.tomo)||'unknown';tomes.set(tome,[...(tomes.get(tome)??[]),document])}
  return {key:periodKey,label:value.label,sortValue:value.sortValue,scope:value.scope,tomes:[...tomes.entries()].map(([tome,rows])=>{
   const cases=new Map<string,DocumentRecord[]>();
   for(const document of rows){
    const normalized=normalizeKardex(document.normalizedKardex??document.kardex);
    const caseKey=document.kardexCaseId??(normalized?`${periodKey}|${tome}|${normalized}`:`unconfirmed:${document.backendId??document.id}`);
    cases.set(caseKey,[...(cases.get(caseKey)??[]),document]);
   }
   return {key:`${periodKey}/tome:${tome}`,label:tome==='unknown'?'Tomo sin identificar':`Tomo ${tome}`,value:tome,sortValue:numberFrom(tome),kardexCases:[...cases.entries()].map(([caseKey,caseRows])=>{
    const normalized=normalizeKardex(caseRows[0].normalizedKardex??caseRows[0].kardex);
    const categories=new Map<string,TomeDocument[]>();
    const sourceTypes=new Map<string,Set<string>>();
    for(const document of caseRows){
     const type=category(document);
     categories.set(type,[...(categories.get(type)??[]),{document,label:filename(document,type),exactFolio:document.printedFolio??document.fojaInicial,requiresReview:!normalized||document.relationStatus==='Requiere revisión'||document.relationStatus==='Conflicto'}]);
     const types=sourceTypes.get(type)??new Set<string>();types.add(clean(document.tipo));sourceTypes.set(type,types);
    }
    return {key:`${periodKey}/tome:${tome}/case:${caseKey}`,label:normalized?`Kardex ${normalized}`:'Kardex sin confirmar',sortValue:normalized,status:caseRows[0].relationStatus??'Kardex sin confirmar',categories:[...categories.entries()].map(([name,items])=>({name,sourceTypes:[...(sourceTypes.get(name)??[])],documents:items.sort((a,b)=>a.label.localeCompare(b.label,'es',{numeric:true}))})).sort((a,b)=>compareCategories(a.name,b.name))};
   }).sort((a,b)=>a.sortValue.localeCompare(b.sortValue,'es',{numeric:true}))};
  }).sort((a,b)=>a.sortValue-b.sortValue)};
 }).filter(group=>group.tomes.length>0).sort((a,b)=>b.sortValue-a.sortValue);
}
