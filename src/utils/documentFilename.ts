export type NormalizedFilenameInput={
  contractor:string;
  kardexNumber:string;
  documentLabel:string;
  documentNumber?:string;
  existingNames?:Iterable<string>;
};

function cleanPart(value:string){
  const printable=Array.from(value.normalize('NFC'),character=>character.charCodeAt(0)<32?' ':character).join('');
  return printable.replace(/[<>:"/\\|?*]/g,' ').replace(/\s+/g,' ').replace(/[.\s]+$/g,'').trim();
}

export function generateNormalizedFilename(input:NormalizedFilenameInput){
  const contractor=cleanPart(input.contractor)||'CONTRATANTE SIN NOMBRE';
  const kardex=cleanPart(input.kardexNumber)||'SIN KARDEX';
  const label=cleanPart(input.documentLabel)||'DOCUMENTO';
  const number=cleanPart(input.documentNumber??'');
  const base=`${contractor} - KARDEX ${kardex} - ${label}${number?` ${number}`:''}`;
  const existing=new Set(Array.from(input.existingNames??[],name=>name.toLocaleLowerCase('es-PE')));
  let candidate=`${base}.pdf`;
  let suffix=2;
  while(existing.has(candidate.toLocaleLowerCase('es-PE'))){candidate=`${base} (${suffix}).pdf`;suffix+=1}
  return candidate;
}
