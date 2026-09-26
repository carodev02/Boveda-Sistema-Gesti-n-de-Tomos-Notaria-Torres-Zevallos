const MAX_FILENAME_LENGTH=180;
const RESERVED=/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

function cleanPart(value:unknown){return Array.from(String(value??'').normalize('NFC'),character=>character.charCodeAt(0)<32?' ':character).join('').replace(/[<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').replace(/[.\s]+$/g,'').trim()}

function normalizedPdfName(value:string,existingNames:Iterable<string>){
  let base=cleanPart(value.replace(/\.pdf$/i,''))||'DOCUMENTO - REVISAR';if(RESERVED.test(base.split('.')[0]?.trim()??''))base=`DOCUMENTO - ${base}`;
  const existing=new Set(Array.from(existingNames,name=>name.toLocaleLowerCase('es-PE')));const fit=(suffix='')=>`${base.slice(0,Math.max(1,MAX_FILENAME_LENGTH-4-suffix.length)).replace(/[.\s]+$/g,'')}${suffix}.pdf`;
  let candidate=fit();let correlation=2;while(existing.has(candidate.toLocaleLowerCase('es-PE'))){candidate=fit(` (${correlation})`);correlation++}return candidate;
}

export function documentDisplayName(input:{documentType:string;kardex:unknown;instrumentNumber?:unknown;primaryContractor?:unknown;existingNames?:Iterable<string>}){
  const kardex=cleanPart(input.kardex).replace(/^K(?=\d)/i,'');const existing=input.existingNames??[];if(!kardex)return normalizedPdfName('DOCUMENTO - REVISAR',existing);
  if(/^minuta$/i.test(input.documentType.trim()))return normalizedPdfName(`K-${kardex}`,existing);
  const contractor=cleanPart(input.primaryContractor);const instrument=cleanPart(input.instrumentNumber);const request=/^solicitud$/i.test(input.documentType.trim());
  return normalizedPdfName([contractor,`KARDEX ${kardex}`,!request&&instrument?`ESCRITURA ${instrument}`:''].filter(Boolean).join(' - '),existing);
}
