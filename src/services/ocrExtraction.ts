export type OcrWord={text:string;confidence:number;pageNumber:number;x:number;y:number;width:number;height:number};
export type SpatialOcrWord={text:string;confidence:number;pageNumber:number;x0:number;y0:number;x1:number;y1:number};
export type ExtractedField={fieldName:string;rawValue:string|null;normalizedValue:string|null;pageNumber?:number;sourceText?:string;confidence:number;extractionMethod:'REGEX'|'LABEL_VALUE'|'CATALOG_MATCH';requiresReview:boolean;alternatives:string[]};

const clean=(value:string)=>value.replace(/\s+/g,' ').trim();
function field(fieldName:string,text:string,pattern:RegExp,confidence=0.82):ExtractedField{
  const match=pattern.exec(text); const value=match?.[1]?clean(match[1]):null;
  return {fieldName,rawValue:value,normalizedValue:value?.replace(/[º°]/g,'' )??null,confidence:value?confidence:0,requiresReview:!value||confidence<0.8,extractionMethod:'LABEL_VALUE',alternatives:[]};
}
export function validContractorName(value:string){const cleaned=clean(value).replace(/^[,;:.-]+|[,;:.-]+$/g,'');const words=cleaned.match(/[A-ZÁÉÍÓÚÑÜ]{2,}/gi)??[];const letters=(cleaned.match(/[A-ZÁÉÍÓÚÑÜ]/gi)??[]).length;const digits=(cleaned.match(/\d/g)??[]).length;const symbols=(cleaned.match(/[^A-ZÁÉÍÓÚÑÜ\s'.,-]/gi)??[]).length;return cleaned.length>=5&&cleaned.length<=100&&words.length>=2&&letters/Math.max(cleaned.length,1)>=.65&&digits===0&&symbols<=1}
function contractorField(text:string):ExtractedField{const match=/(?:comparece(?:n)?|otorgante(?:s)?|contratante(?:s)?|señor(?:a|es)?|a\s+favor\s+de)[\s:.-]+([^\n]{5,100})/i.exec(text);const raw=match?.[1]?clean(match[1]).replace(/\s+(?:QUIEN|DECLARA|MANIFIESTA|OTORGA|POR\s+EL\s+PRESENTE)\b.*$/i,'').replace(/[;:,.]\s+.*$/,'').trim():null;const valid=Boolean(raw&&validContractorName(raw));return{fieldName:'contractor',rawValue:raw,normalizedValue:valid?raw:null,confidence:valid?0.84:0,requiresReview:!valid,extractionMethod:'LABEL_VALUE',alternatives:[]}}
function historicalCode(fieldName:string,text:string,label:string,aliases=label):ExtractedField{const normalizeCode=(value:string)=>value.toUpperCase().replace(/O/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/T/g,'7'),hasMargin=text.includes('MARCAS_LATERALES'),margin=hasMargin?text.slice(text.indexOf('MARCAS_LATERALES')):text,pattern=new RegExp(`(?:^|\\n|\\s)(?:${hasMargin?aliases:label})\\s*[.:;·-]?\\s*([0-9OILSBT]{1,8})(?=\\s|$)`,'gim');const candidates=[...margin.matchAll(pattern)].map(match=>({raw:match[1],normalized:normalizeCode(match[1])}));if(!candidates.length){const fallback=new RegExp(`(?:^|\\n)\\s*${label}\\s*[.:;·-]?\\s*([0-9OILSBT]{1,8})`,'im').exec(text);if(fallback)candidates.push({raw:fallback[1],normalized:normalizeCode(fallback[1])})}candidates.sort((left,right)=>{const score=(value:string)=>(label==='K'&&value.length===3?20:0)+value.length;return score(right.normalized)-score(left.normalized)});const best=candidates[0],chosen=best?.normalized?(fieldName==='kardexNumber'?best.normalized.replace(/^0+(?=\d)/,''):best.normalized):null;return{fieldName,rawValue:best?.raw??null,normalizedValue:chosen,confidence:best?0.86:0,requiresReview:!best,extractionMethod:'LABEL_VALUE',alternatives:candidates.slice(1).map(item=>item.normalized)}}
export function normalizeOcrText(text:string){return text.replace(/\r/g,'').split('\n').map(clean).filter(Boolean).join('\n');}
const codeValue=(value:string)=>value.toUpperCase().replace(/[^0-9OILSBT]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1').replace(/S/g,'5').replace(/B/g,'8').replace(/T/g,'7');
export function extractSpatialHistoricalFields(words:SpatialOcrWord[]){
  const output:Partial<Record<'kardexNumber'|'instrumentNumber'|'minuteNumber'|'printedFolio'|'unclassifiedAv',string>>={};
  const normalized=words.map(word=>({...word,token:word.text.toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚ.°º:-]/g,'')})).filter(word=>word.token);
  const labels=[
    {field:'kardexNumber' as const,patterns:[/^K(?:ARDEX)?[.:°º-]?$/,/^X[.:°º-]?$/]},
    {field:'instrumentNumber' as const,patterns:[/^E[.:°º-]?$/]},
    {field:'minuteNumber' as const,patterns:[/^[MN][.:°º-]?$/]},
    {field:'printedFolio' as const,patterns:[/^FOJAS?[.:°º-]?$/,/^FOLIOS?[.:°º-]?$/]},
    {field:'unclassifiedAv' as const,patterns:[/^A[.:]?V[.:°º-]?$/]},
  ];
  for(const label of labels){
    const candidates:Array<{value:string;score:number}>=[];
    for(let index=0;index<normalized.length;index++){
      const anchor=normalized[index];let inline:string|undefined;
      for(const pattern of label.patterns){const source=pattern.source.replace(/\$$/,'');const match=new RegExp(`${source}([0-9OILSBT]{1,8})$`,'i').exec(anchor.token);if(match){inline=codeValue(match[1]);break}}
      if(inline)candidates.push({value:inline,score:100+anchor.confidence+inline.length*4});
      if(!label.patterns.some(pattern=>pattern.test(anchor.token)))continue;
      const height=Math.max(8,anchor.y1-anchor.y0),centerY=(anchor.y0+anchor.y1)/2;
      for(const candidate of normalized){if(candidate===anchor||candidate.pageNumber!==anchor.pageNumber)continue;const value=codeValue(candidate.token);if(!value||value.length>8)continue;const candidateCenterY=(candidate.y0+candidate.y1)/2,dx=candidate.x0-anchor.x1,dy=Math.abs(candidateCenterY-centerY);const sameLine=dx>=-height*.3&&dx<=height*14&&dy<=height*1.25;const below=Math.abs(candidate.x0-anchor.x0)<=height*4&&candidate.y0>=anchor.y1&&candidate.y0-anchor.y1<=height*3;if(!sameLine&&!below)continue;const distance=Math.max(0,dx)+dy*2;const expected=(label.field==='kardexNumber'&&value.length>=2?24:0)+(label.field!=='kardexNumber'&&value.length<=4?8:0);candidates.push({value,score:anchor.confidence+candidate.confidence+expected-distance/height*8})}
    }
    const best=candidates.sort((a,b)=>b.score-a.score||b.value.length-a.value.length)[0];if(best&&best.score>=45)output[label.field]=label.field==='kardexNumber'?best.value.replace(/^0+(?=\d)/,''):best.value;
  }
  return output;
}
export function extractNotarialFields(text:string):ExtractedField[]{
  const normalized=normalizeOcrText(text);
  const instrument=/(escritura(?:\s+p[uú]blica)?|acta|poder|testamento|instrumento)\s*(?:n(?:[uú]mero|umero|[.º°])?\s*)?[:.]?\s*([0-9]{1,8})/i.exec(normalized);
  const documentClass=/\b(escritura(?:\s+p[uú]blica)?|acta|poder|testamento|instrumento)\b/i.test(normalized)?'REGISTRO_NOTARIAL':/^\s*MINUTA\b/im.test(normalized)?'MINUTA':null;
  return [
    field('kardexNumber',normalized,/(?:k(?:ardex|ardes|ardez)|c[oó]digo\s+kardex)\s*(?:n(?:[uú]mero|umero|[.º°])?\s*)?[:.-]?\s*([0-9]{1,8})/i).normalizedValue?field('kardexNumber',normalized,/(?:k(?:ardex|ardes|ardez)|c[oó]digo\s+kardex)\s*(?:n(?:[uú]mero|umero|[.º°])?\s*)?[:.-]?\s*([0-9]{1,8})/i):historicalCode('kardexNumber',normalized,'K','K|X'),
    field('minuteNumber',normalized,/(?:minuta\s*(?:n(?:úmero|umero|[.º°])?\s*)|n(?:úmero|umero)\s*de\s*minuta\s*[:.]?\s*)([0-9]{1,8})/i).normalizedValue?field('minuteNumber',normalized,/(?:minuta\s*(?:n(?:úmero|umero|[.º°])?\s*)|n(?:úmero|umero)\s*de\s*minuta\s*[:.]?\s*)([0-9]{1,8})/i):historicalCode('minuteNumber',normalized,'M','M|N'),
    field('printedFolio',normalized,/(?:fojas?|folios?|folio)\s*[:.]?\s*([0-9]{1,8})/i),
    {...(field('instrumentNumber',normalized,/(?:escritura(?:\s+p[uú]blica)?|acta|poder|testamento|instrumento)\s*(?:n(?:[uú]mero|umero|[.º°])?\s*)?[:.]?\s*([0-9]{1,8})/i).normalizedValue?field('instrumentNumber',normalized,/(?:escritura(?:\s+p[uú]blica)?|acta|poder|testamento|instrumento)\s*(?:n(?:[uú]mero|umero|[.º°])?\s*)?[:.]?\s*([0-9]{1,8})/i):historicalCode('instrumentNumber',normalized,'E'))},
    {fieldName:'instrumentType',rawValue:instrument?.[1]??null,normalizedValue:instrument?.[1]?.toUpperCase()??null,confidence:instrument?.[1]?.length?0.88:0,requiresReview:!instrument?.[1],extractionMethod:'LABEL_VALUE',alternatives:[]},
    contractorField(normalized),
    field('documentDate',normalized,/(?:fecha|a\s+los)\s*[:.]?\s*((?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2})|(?:[0-3]?\d\s+de\s+[a-záéíóú]+\s+de\s+(?:19|20)\d{2}))/i,.78),
    {fieldName:'documentClass',rawValue:documentClass,normalizedValue:documentClass,confidence:documentClass?0.9:0,requiresReview:!documentClass,extractionMethod:'CATALOG_MATCH',alternatives:[]},
    field('unclassifiedAv',normalized,/(?:^|\n)\s*A\s*[.]?\s*V\s*[.:·-]\s*([^\n]{1,40})/im,.45),
  ];
}
export function classifyLegalAct(text:string){const normalized=normalizeOcrText(text).toLowerCase();const catalog=[['compraventa',/\bcompraventa\b/],['donacion',/\bdonaci[oó]n\b/],['poder',/\bpoder\s+(?:especial|general)\b/],['hipoteca',/\bhipoteca\b/],['testamento',/\btestamento\b/],['constitucion',/\bconstituci[oó]n\s+de\s+empresa\b/]] as const;const hit=catalog.find(([,pattern])=>pattern.test(normalized));return {suggested:hit?.[0]??null,alternatives:catalog.filter(([name,pattern])=>pattern.test(normalized)&&name!==hit?.[0]).map(([name])=>name),requiresReview:!hit};}
export function proposedFilename(contractor:string,kardex:string,label:string,number?:string){const safe=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[<>:"/\\|?*]+/g,' ').replace(/\s+/g,' ').trim();const base=[safe(contractor),kardex&&`KARDEX ${safe(kardex)}`,safe(label),number&&safe(number)].filter(Boolean).join(' - ');return `${base||'KARDEX - REVISAR'}.pdf`;}
