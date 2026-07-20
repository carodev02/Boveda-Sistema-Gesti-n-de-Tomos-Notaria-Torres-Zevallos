export type NormalizedFilenameInput={
  contractor?:string;
  kardexNumber?:string;
  documentClass:'MINUTA'|'REGISTRO_NOTARIAL';
  instrumentNumber?:string;
  existingNames?:Iterable<string>;
};

const MAX_FILENAME_LENGTH=180;
const RESERVED=/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function cleanPart(value:string){
  return Array.from(value.normalize('NFC'),character=>character.charCodeAt(0)<32?' ':character).join('').replace(/[<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').replace(/[.\s]+$/g,'').trim();
}

function uniquePdfName(base:string,existingNames?:Iterable<string>){
  const existing=new Set(Array.from(existingNames??[],name=>name.toLocaleLowerCase('es-PE')));
  const fit=(suffix='')=>`${base.slice(0,Math.max(1,MAX_FILENAME_LENGTH-4-suffix.length)).replace(/[.\s]+$/g,'')}${suffix}.pdf`;
  let candidate=fit();let correlation=2;
  while(existing.has(candidate.toLocaleLowerCase('es-PE'))){candidate=fit(` (${correlation})`);correlation+=1}
  return candidate;
}

export function normalizePdfFilename(value:string,existingNames?:Iterable<string>){
  const withoutExtension=value.replace(/\.pdf$/i,'');
  let base=cleanPart(withoutExtension)||'DOCUMENTO - REVISAR';
  if(RESERVED.test(base.split('.')[0].trim()))base=`DOCUMENTO - ${base}`;
  return uniquePdfName(base,existingNames);
}

export function generateNormalizedFilename(input:NormalizedFilenameInput){
  const kardex=cleanPart(input.kardexNumber??'');
  if(!kardex)return normalizePdfFilename('DOCUMENTO - REVISAR',input.existingNames);
  const contractor=cleanPart(input.contractor??'');
  const instrument=cleanPart(input.instrumentNumber??'');
  const parts=[contractor,`KARDEX ${kardex}`];
  if(input.documentClass==='MINUTA')parts.push('MINUTA');
  if(input.documentClass==='REGISTRO_NOTARIAL'&&instrument)parts.push(`ESCRITURA ${instrument}`);
  return normalizePdfFilename(parts.filter(Boolean).join(' - '),input.existingNames);
}
