export type OcrWord={text:string;confidence:number;pageNumber:number;x:number;y:number;width:number;height:number};
export type ExtractedField={fieldName:string;rawValue:string|null;normalizedValue:string|null;pageNumber?:number;sourceText?:string;confidence:number;extractionMethod:'REGEX'|'LABEL_VALUE'|'CATALOG_MATCH';requiresReview:boolean;alternatives:string[]};

const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
function field(fieldName:string,text:string,pattern:RegExp,confidence=0.82):ExtractedField{
  const match=pattern.exec(text); const value=match?.[1]?clean(match[1]):null;
  return {fieldName,rawValue:value,normalizedValue:value?.replace(/[º°]/g,'' )??null,confidence:value?confidence:0,requiresReview:!value||confidence<0.8,extractionMethod:'LABEL_VALUE',alternatives:[]};
}
export function normalizeOcrText(text:string){return text.replace(/\r/g,'').split('\n').map(clean).filter(Boolean).join('\n');}
export function extractNotarialFields(text:string):ExtractedField[]{
  const normalized=normalizeOcrText(text);
  return [
    field('kardexNumber',normalized,/k(?:ardex|\.)\s*(?:n[.º°]?\s*)?[:.]?\s*([0-9]{1,8})/i),
    field('minuteNumber',normalized,/(?:minuta\s*(?:n(?:úmero|umero|[.º°])?\s*)|n(?:úmero|umero)\s*de\s*minuta\s*[:.]?\s*)([0-9]{1,8})/i),
    field('printedFolio',normalized,/(?:fojas?|folios?|folio)\s*[:.]?\s*([0-9]{1,8})/i),
    field('instrumentNumber',normalized,/(?:escritura|acta|poder|testamento|instrumento)\s*(?:n(?:úmero|umero|[.º°])?\s*)?[:.]?\s*([0-9]{1,8})/i),
  ];
}
export function classifyLegalAct(text:string){const normalized=normalizeOcrText(text).toLowerCase();const catalog=[['compraventa',/\bcompraventa\b/],['donacion',/\bdonaci[oó]n\b/],['poder',/\bpoder\s+(?:especial|general)\b/],['hipoteca',/\bhipoteca\b/],['testamento',/\btestamento\b/],['constitucion',/\bconstituci[oó]n\s+de\s+empresa\b/]] as const;const hit=catalog.find(([,pattern])=>pattern.test(normalized));return {suggested:hit?.[0]??null,alternatives:catalog.filter(([name,pattern])=>pattern.test(normalized)&&name!==hit?.[0]).map(([name])=>name),requiresReview:!hit};}
export function proposedFilename(contractor:string,kardex:string,label:string,number?:string){const safe=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[<>:"/\\|?*]+/g,' ').replace(/\s+/g,' ').trim();const base=[safe(contractor),kardex&&`KARDEX ${safe(kardex)}`,safe(label),number&&safe(number)].filter(Boolean).join(' - ');return `${base||'KARDEX - REVISAR'}.pdf`;}
