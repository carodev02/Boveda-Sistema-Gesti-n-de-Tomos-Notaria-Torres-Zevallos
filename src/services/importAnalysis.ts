import type {DetectedValue,ExcelTargetField,InventoryFile,NormalizedExcelRow,PdfDocumentEvidence,PreliminaryDocumentClass,ValidationMatchStatus} from '../domain/document-domain';

const roman='[IVXLCDM]+';
const normalizeText=(value:string)=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replace(/\s+/g,' ').trim();
function detected(value:string,source:'FOLDER'|'FILENAME',confidence:number,originalText:string,pathSegmentIndex:number):DetectedValue{return {value,source,confidence,originalText,pathSegmentIndex}}

export function extractPeriod(text:string,source:'FOLDER'|'FILENAME'='FOLDER',index=0){
  const normalized=normalizeText(text).replace(/[–—]/g,'-');
  const biennium=normalized.match(/(?:BIENIO\s*)?((?:19|20)\d{2})\s*-\s*((?:19|20)\d{2})/);
  if(biennium)return detected(`${biennium[1]}-${biennium[2]}`,source,95,text,index);
  const year=normalized.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return year?detected(year[1],source,80,text,index):undefined;
}
export function extractTome(text:string,source:'FOLDER'|'FILENAME'='FOLDER',index=0){
  const match=normalizeText(text).match(new RegExp(`(?:N[°ºO.]?\\s*)?TOMO\\s*0*(${roman}|\\d+)`));
  return match?detected(match[1],source,92,text,index):undefined;
}
export function extractFolios(text:string,source:'FOLDER'|'FILENAME'='FOLDER',index=0){
  const normalized=normalizeText(text);
  const match=normalized.match(/FOJAS?\s*(\d{1,6})\s*(?:-|A)\s*(\d{1,6})/)??normalized.match(/FOJAS?\s*(\d{1,6})/);
  return match?detected(match[2]?`${match[1]}-${match[2]}`:match[1],source,match[2]?92:85,text,index):undefined;
}
export function extractKardex(text:string,source:'FOLDER'|'FILENAME'='FILENAME',index=0){
  const base=text.replace(/\.[^.]+$/,'');const normalized=normalizeText(base);
  const explicit=normalized.match(/(?:KARDEX|KARDES|KARDEZ|KARDX|KARDE|KRDEX|KADEX|KARAX|GARDEX|K)\s*(?:N[°ºO.]?\s*)?(\d{1,12})/);
  if(explicit)return detected(explicit[1],source,98,text,index);
  const isolated=normalized.match(/^(\d{2,12})$/);
  return isolated?detected(isolated[1],source,70,text,index):undefined;
}
export function classifyPath(segments:string[]):PreliminaryDocumentClass{
  const normalized=normalizeText(segments.join(' '));
  if(/\bMINUTAS?\b/.test(normalized))return'MINUTA';
  if(/\b(ESCRITURA(?:S| PUBLICA)?|PODER(?:ES)?|TESTAMENTO(?:S)?|ACTA(?:S)?|VEHICULAR|PROPIEDAD|PERSONAS|GARANTIAS|MERCANTIL)\b/.test(normalized))return'REGISTRO_NOTARIAL';
  return'UNKNOWN';
}
export function analyzeInventoryPath(input:{jobId:string;relativePath:string;name:string;size:number;modifiedAt?:number;rootContext?:string}):InventoryFile{
  const segments=input.relativePath.replace(/\\/g,'/').split('/').filter(Boolean);const parents=segments.slice(0,-1);const contextualParents=[input.rootContext,...parents].filter(Boolean) as string[];const filenameIndex=segments.length-1;const find=<T>(extractor:(value:string,source:'FOLDER'|'FILENAME',index:number)=>T|undefined)=>extractor(input.name,'FILENAME',filenameIndex)??contextualParents.map((part,index)=>extractor(part,'FOLDER',index)).find(Boolean);
  const extension=(input.name.match(/\.([^.]+)$/)?.[1]??'').toLowerCase();const supported=['pdf','xlsx','xls','jpg','jpeg','png','tif','tiff'].includes(extension);
  const contractorText=parents.at(-1)??'';const contractor=/^(?:TOMO|FOJAS?|BIENIO|ESCRIT(?:URA|\.)?)\b/i.test(contractorText)?undefined:detected(contractorText,'FOLDER',55,contractorText,parents.length-1);
  return{id:`${input.jobId}:${input.relativePath}`,jobId:input.jobId,relativePath:input.relativePath,originalName:input.name,extension,size:input.size,modifiedAt:input.modifiedAt,depth:Math.max(0,segments.length-1),parentFolders:parents,preliminaryClass:classifyPath(segments),kardex:find(extractKardex),period:find(extractPeriod),tome:find(extractTome),folios:find(extractFolios),contractor,analysisStatus:supported?'ANALYZED':'UNSUPPORTED'};
}
export function groupWrittenInstrumentPages(files:InventoryFile[]){
  const groups=new Map<string,InventoryFile[]>();
  for(const file of files){if(file.extension!=='pdf')continue;const parts=file.relativePath.replace(/\\/g,'/').split('/');const parent=parts.slice(0,-1).join('/');if(!/(?:^|\/)ESCRITURA\s+\d+$/i.test(parent)||!/^pag(?:ina)?[._ -]*\d+\.pdf$/i.test(file.originalName))continue;const list=groups.get(parent)??[];list.push(file);groups.set(parent,list)}
  const updates:InventoryFile[]=[];
  for(const [parent,pages] of groups){pages.sort((left,right)=>pageNumber(left.originalName)-pageNumber(right.originalName)||left.originalName.localeCompare(right.originalName));updates.push(...pages.map(page=>({...page,extension:'pdf-page',analysisStatus:'IGNORED' as const})));const folderName=parent.split('/').at(-1)??'ESCRITURA';const first=pages[0];updates.push({...first,id:`${first.jobId}:${parent}:DOCUMENTO_LOGICO`,relativePath:`${parent}/${folderName}.pdf`,originalName:`${folderName}.pdf`,extension:'pdf',size:pages.reduce((sum,page)=>sum+page.size,0),modifiedAt:Math.max(...pages.map(page=>page.modifiedAt??0)),preliminaryClass:'REGISTRO_NOTARIAL',analysisStatus:'ANALYZED',componentPaths:pages.map(page=>page.relativePath),logicalPageGroup:true,kardex:undefined,contractor:undefined})}
  return updates;
}
function pageNumber(name:string){return Number(name.match(/(\d+)(?=\.pdf$)/i)?.[1]??Number.MAX_SAFE_INTEGER)}

const headerAliases:Record<Exclude<ExcelTargetField,'IGNORE'>,string[]>={correlative:['N','NRO','NUMERO','CANTIDAD','CORRELATIVO','ITEM'],kardexNumber:['KARDEX','N KARDEX','NRO KARDEX','NUMERO DE KARDEX'],tomeNumber:['TOMO','NUMERO DE TOMO','N TOMO','N DE TOMO','NRO DE TOMO'],year:['ANO','AÑO'],biennium:['BIENIO'],instrumentType:['TIPO DE INSTRUMENTO','INSTRUMENTO'],instrumentNumber:['NUMERO DE INSTRUMENTO','NRO INSTRUMENTO','NUMERO DE ESCRITURA PUBLICA','N ESCRITURA PUBLICA','NRO ESCRITURA PUBLICA'],minuteNumber:['MINUTA','NUMERO DE MINUTA'],legalAct:['CONTRATO','ACTO JURIDICO','ACTO'],contractor:['CONTRATANTE','CONTRATANTES','OTORGANTE','OTORGANTES'],folios:['FOJAS','FOJA','RANGO DE FOJAS'],date:['FECHA'],registryType:['TIPO DE REGISTRO','REGISTRO'],observations:['OBSERVACION','OBSERVACIONES']};
export function normalizeHeader(header:string){return normalizeText(header).replace(/[°º.]/g,'').replace(/\bNUM\b/g,'NUMERO').replace(/\s+/g,' ').trim()}
export function suggestHeader(header:string):ExcelTargetField{const normalized=normalizeHeader(header);if(/(?:19|20)\d{2}\s*-\s*(?:19|20)\d{2}/.test(normalized))return'biennium';for(const [target,aliases] of Object.entries(headerAliases) as Array<[Exclude<ExcelTargetField,'IGNORE'>,string[]]>)if(aliases.some(alias=>normalized===normalizeHeader(alias)))return target;return'IGNORE'}
export function splitInstrument(value:unknown){const raw=String(value??'').trim();const match=raw.match(/^([^:0-9]+)\s*[:#-]?\s*(\d[\w/-]*)$/);return match?{instrumentType:normalizeText(match[1]),instrumentNumber:match[2].trim()}:{instrumentType:'',instrumentNumber:raw}}
export function normalizeKardex(value:unknown){const raw=String(value??'').trim();return raw.replace(/\.0+$/,'').replace(/\s+/g,'').replace(/^0+(?=\d)/,'')}
function editDistance(left:string,right:string){const previous=Array.from({length:right.length+1},(_,index)=>index);for(let leftIndex=1;leftIndex<=left.length;leftIndex++){let diagonal=previous[0];previous[0]=leftIndex;for(let rightIndex=1;rightIndex<=right.length;rightIndex++){const above=previous[rightIndex],cost=left[leftIndex-1]===right[rightIndex-1]?0:1;previous[rightIndex]=Math.min(previous[rightIndex]+1,previous[rightIndex-1]+1,diagonal+cost);diagonal=above}}return previous[right.length]}
function nameSimilarity(left:unknown,right:unknown){const tokens=(value:unknown)=>new Set(normalizeText(String(value??'')).split(/\s+/).filter(token=>token.length>1));const a=tokens(left),b=tokens(right);if(!a.size||!b.size)return 0;const shared=[...a].filter(token=>b.has(token)).length;return shared/Math.max(a.size,b.size)}
function suggestExcelRow(file:InventoryFile,rows:NormalizedExcelRow[]){const kardex=normalizeKardex(file.kardex?.value);const ranked=rows.map(row=>{const candidate=normalizeKardex(row.values.kardexNumber?.normalizedValue);const distance=kardex&&candidate?editDistance(kardex,candidate):99;const contractor=nameSimilarity(file.contractor?.value,row.values.contractor?.normalizedValue);const sameTome=file.tome?.value&&normalizeText(file.tome.value)===normalizeText(String(row.values.tomeNumber?.normalizedValue??''));const excelPeriod=row.values.biennium?.normalizedValue??row.values.year?.normalizedValue;const samePeriod=file.period?.value&&normalizeText(file.period.value)===normalizeText(String(excelPeriod??''));const score=(distance===1?5:distance===2?1:0)+contractor*4+(sameTome?2:0)+(samePeriod?2:0);return{row,distance,contractor,score}}).filter(item=>item.distance<=1||item.contractor>=.7).sort((a,b)=>b.score-a.score);if(!ranked.length||ranked[0].score<5||ranked[1]?.score===ranked[0].score)return undefined;return ranked[0]}
export function compareInventoryWithExcel(file:InventoryFile,rows:NormalizedExcelRow[]):{status:ValidationMatchStatus;matches:NormalizedExcelRow[];conflicts:string[];contractors:string[]}{
  const kardex=file.kardex?.value;if(!kardex){const suggestion=suggestExcelRow(file,rows);if(!suggestion)return{status:'KARDEX_NOT_DETECTED',matches:[],conflicts:[],contractors:[]};const suggestedKardex=String(suggestion.row.values.kardexNumber?.normalizedValue??'');const suggestedName=String(suggestion.row.values.contractor?.normalizedValue??'');return{status:'PARTIAL_MATCH',matches:[suggestion.row],conflicts:[`Sugerencia para revisar: el documento sin Kardex podría corresponder a ${suggestedKardex} · ${suggestedName}`],contractors:suggestedName?[suggestedName]:[]}}
  const matches=rows.filter(row=>String(row.values.kardexNumber?.normalizedValue??'')===kardex);if(!matches.length){const suggestion=suggestExcelRow(file,rows);if(!suggestion)return{status:'NOT_FOUND_IN_EXCEL',matches:[],conflicts:[],contractors:[]};const suggestedKardex=String(suggestion.row.values.kardexNumber?.normalizedValue??'');const suggestedName=String(suggestion.row.values.contractor?.normalizedValue??'');return{status:'PARTIAL_MATCH',matches:[suggestion.row],conflicts:[`Sugerencia para revisar: Kardex ${kardex} podría ser ${suggestedKardex}${suggestedName?` · ${suggestedName}`:''}`],contractors:suggestedName?[suggestedName]:[]}}
  const contractors=[...new Set(matches.map(row=>String(row.values.contractor?.normalizedValue??'')).filter(Boolean))];if(matches.length>1)return{status:'DUPLICATE_IN_EXCEL',matches,conflicts:[],contractors};
  const row=matches[0];const conflicts:string[]=[];let partial=false;const compare=(label:string,folder?:string,excel?:unknown)=>{if(!folder||excel==null)return;const left=normalizeText(folder),right=normalizeText(String(excel));if(left===right)return;if(label==='Contratante'&&(left.includes(right)||right.includes(left))){partial=true;return}conflicts.push(label)};
  compare('Tomo',file.tome?.value,row.values.tomeNumber?.normalizedValue);compare('Año o bienio',file.period?.value,row.values.biennium?.normalizedValue??row.values.year?.normalizedValue);compare('Fojas',file.folios?.value,row.values.folios?.normalizedValue);compare('Contratante',file.contractor?.value,row.values.contractor?.normalizedValue);
  return{status:conflicts.length?'CONFLICT':partial?'PARTIAL_MATCH':'MATCHED',matches,conflicts,contractors};
}
export function comparePdfEvidenceWithExcel(file:InventoryFile,evidence:PdfDocumentEvidence,rows:NormalizedExcelRow[]){
  const conflicts:string[]=[];if(evidence.status==='ERROR')return{conflicts:[`Lectura PDF: ${evidence.error??'error desconocido'}`],matches:[] as NormalizedExcelRow[],pdfOnlyConfirmed:false};if(evidence.error)conflicts.push(`Lectura PDF parcial: ${evidence.error}`);
  const pathKardex=normalizeKardex(file.kardex?.value);const pdfKardex=normalizeKardex(evidence.fields.kardexNumber);
  if(pathKardex&&!pdfKardex)conflicts.push('Kardex: no fue detectado dentro del PDF; requiere revisión');
  if(pathKardex&&pdfKardex&&pathKardex!==pdfKardex)conflicts.push(`Kardex: ruta/archivo ${pathKardex} ≠ PDF ${pdfKardex}`);
  const lookup=pdfKardex||pathKardex;const matches=lookup?rows.filter(row=>normalizeKardex(row.values.kardexNumber?.normalizedValue)===lookup):[];
  const reliableReading=!evidence.usedOcr||(evidence.averageConfidence??0)>=55;const pdfOnlyConfirmed=Boolean(reliableReading&&pdfKardex&&evidence.fields.minuteNumber&&evidence.fields.printedFolio&&evidence.fields.instrumentNumber&&evidence.legalAct);
  if(lookup&&!matches.length&&!pdfOnlyConfirmed)conflicts.push(`Kardex ${lookup}: no existe en el índice Excel y el PDF no aportó todos los campos obligatorios`);
  if(matches.length>1)conflicts.push(`Kardex ${lookup}: aparece ${matches.length} veces en el índice Excel`);
  const row=matches[0];if(row){
    const compare=(label:string,pdfValue?:string,excelValue?:unknown,contains=false)=>{const right=String(excelValue??'').trim();if(!pdfValue||!right)return;const leftNormalized=normalizeText(pdfValue),rightNormalized=normalizeText(right);if(leftNormalized===rightNormalized||(contains&&(leftNormalized.includes(rightNormalized)||rightNormalized.includes(leftNormalized))))return;conflicts.push(`${label}: PDF ${pdfValue} ≠ Excel ${right}`)};
    compare('Kardex',pdfKardex,row.values.kardexNumber?.normalizedValue);
    compare('Minuta',evidence.fields.minuteNumber,row.values.minuteNumber?.normalizedValue);
    compare('Foja',evidence.fields.printedFolio,row.values.folios?.normalizedValue);
    compare('Instrumento',evidence.fields.instrumentNumber,row.values.instrumentNumber?.normalizedValue);
    compare('Acto jurídico',evidence.legalAct,row.values.legalAct?.normalizedValue,true);
  }
  return{conflicts,matches,pdfOnlyConfirmed};
}
export async function processMetadataBatches<T>(items:T[],options:{start?:number;batchSize:number;cancelled:()=>boolean;paused:()=>boolean;onBatch:(batch:T[],cursor:number)=>Promise<void>|void;yieldControl?:()=>Promise<void>}){
  let cursor=options.start??0;while(cursor<items.length&&!options.cancelled()&&!options.paused()){const end=Math.min(cursor+options.batchSize,items.length);await options.onBatch(items.slice(cursor,end),end);cursor=end;await(options.yieldControl?.()??Promise.resolve())}return{cursor,completed:cursor===items.length,cancelled:options.cancelled(),paused:options.paused()};
}
