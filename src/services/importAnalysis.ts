import type {DetectedValue,ExcelTargetField,InventoryFile,NormalizedExcelRow,PreliminaryDocumentClass,ValidationMatchStatus} from '../domain/document-domain';

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
  const match=normalized.match(/(?:FOJAS?\s*)?(\d{1,6})\s*(?:-|A)\s*(\d{1,6})/)??normalized.match(/FOJAS?\s*(\d{1,6})/);
  return match?detected(match[2]?`${match[1]}-${match[2]}`:match[1],source,match[2]?92:85,text,index):undefined;
}
export function extractKardex(text:string,source:'FOLDER'|'FILENAME'='FILENAME',index=0){
  const base=text.replace(/\.[^.]+$/,'');const normalized=normalizeText(base);
  const explicit=normalized.match(/(?:KARDEX|K)\s*(?:N[°ºO.]?\s*)?(\d{1,12})/);
  if(explicit)return detected(explicit[1],source,98,text,index);
  const isolated=normalized.match(/^(\d{2,12})$/);
  return isolated?detected(isolated[1],source,70,text,index):undefined;
}
export function classifyPath(segments:string[]):PreliminaryDocumentClass{
  const normalized=normalizeText(segments.join(' '));
  if(/\bMINUTAS?\b/.test(normalized))return'MINUTA';
  if(/\b(VEHICULAR|PROPIEDAD|PERSONAS|GARANTIAS|MERCANTIL)\b/.test(normalized))return'REGISTRO_NOTARIAL';
  const evidence=[/\bESCRITURAS?\b/,/\bPODERES?\b/,/\bTESTAMENTOS?\b/,/\bACTAS?\b/,/\bTOMO\b/,/\bFOJAS?\b/].filter(pattern=>pattern.test(normalized)).length;
  return evidence>=2?'REGISTRO_NOTARIAL':'UNKNOWN';
}
export function analyzeInventoryPath(input:{jobId:string;relativePath:string;name:string;size:number;modifiedAt?:number}):InventoryFile{
  const segments=input.relativePath.replace(/\\/g,'/').split('/').filter(Boolean);const parents=segments.slice(0,-1);const filenameIndex=segments.length-1;const find=<T>(extractor:(value:string,source:'FOLDER'|'FILENAME',index:number)=>T|undefined)=>extractor(input.name,'FILENAME',filenameIndex)??parents.map((part,index)=>extractor(part,'FOLDER',index)).find(Boolean);
  const extension=(input.name.match(/\.([^.]+)$/)?.[1]??'').toLowerCase();const supported=['pdf','xlsx','xls','jpg','jpeg','png','tif','tiff'].includes(extension);
  const contractor=parents.length?detected(parents[parents.length-1],'FOLDER',55,parents[parents.length-1],parents.length-1):undefined;
  return{id:`${input.jobId}:${input.relativePath}`,jobId:input.jobId,relativePath:input.relativePath,originalName:input.name,extension,size:input.size,modifiedAt:input.modifiedAt,depth:Math.max(0,segments.length-1),parentFolders:parents,preliminaryClass:classifyPath(segments),kardex:find(extractKardex),period:find(extractPeriod),tome:find(extractTome),folios:find(extractFolios),contractor,analysisStatus:supported?'ANALYZED':'UNSUPPORTED'};
}

const headerAliases:Record<Exclude<ExcelTargetField,'IGNORE'>,string[]>={correlative:['CANTIDAD','CORRELATIVO','ITEM'],kardexNumber:['KARDEX','N KARDEX','NRO KARDEX','NUMERO DE KARDEX'],tomeNumber:['TOMO','NUMERO DE TOMO','N TOMO'],year:['ANO','AÑO'],biennium:['BIENIO'],instrumentType:['TIPO DE INSTRUMENTO','INSTRUMENTO'],instrumentNumber:['NUMERO DE INSTRUMENTO','NRO INSTRUMENTO'],minuteNumber:['MINUTA','NUMERO DE MINUTA'],legalAct:['CONTRATO','ACTO JURIDICO','ACTO'],contractor:['CONTRATANTE','OTORGANTE'],folios:['FOJAS','FOJA','RANGO DE FOJAS'],date:['FECHA'],registryType:['TIPO DE REGISTRO','REGISTRO']};
export function normalizeHeader(header:string){return normalizeText(header).replace(/[°º.]/g,'').replace(/\bNUM\b/g,'NUMERO').replace(/\s+/g,' ').trim()}
export function suggestHeader(header:string):ExcelTargetField{const normalized=normalizeHeader(header);for(const [target,aliases] of Object.entries(headerAliases) as Array<[Exclude<ExcelTargetField,'IGNORE'>,string[]]>)if(aliases.some(alias=>normalized===normalizeHeader(alias)))return target;return'IGNORE'}
export function splitInstrument(value:unknown){const raw=String(value??'').trim();const match=raw.match(/^([^:0-9]+)\s*[:#-]?\s*(\d[\w/-]*)$/);return match?{instrumentType:normalizeText(match[1]),instrumentNumber:match[2].trim()}:{instrumentType:'',instrumentNumber:raw}}
export function normalizeKardex(value:unknown){const raw=String(value??'').trim();return raw.replace(/\.0+$/,'').replace(/\s+/g,'')}
export function compareInventoryWithExcel(file:InventoryFile,rows:NormalizedExcelRow[]):{status:ValidationMatchStatus;matches:NormalizedExcelRow[];conflicts:string[];contractors:string[]}{
  const kardex=file.kardex?.value;if(!kardex)return{status:'KARDEX_NOT_DETECTED',matches:[],conflicts:[],contractors:[]};
  const matches=rows.filter(row=>String(row.values.kardexNumber?.normalizedValue??'')===kardex);if(!matches.length)return{status:'NOT_FOUND_IN_EXCEL',matches:[],conflicts:[],contractors:[]};
  const contractors=[...new Set(matches.map(row=>String(row.values.contractor?.normalizedValue??'')).filter(Boolean))];if(matches.length>1)return{status:'DUPLICATE_IN_EXCEL',matches,conflicts:[],contractors};
  const row=matches[0];const conflicts:string[]=[];let partial=false;const compare=(label:string,folder?:string,excel?:unknown)=>{if(!folder||excel==null)return;const left=normalizeText(folder),right=normalizeText(String(excel));if(left===right)return;if(label==='Contratante'&&(left.includes(right)||right.includes(left))){partial=true;return}conflicts.push(label)};
  compare('Tomo',file.tome?.value,row.values.tomeNumber?.normalizedValue);compare('Año o bienio',file.period?.value,row.values.biennium?.normalizedValue??row.values.year?.normalizedValue);compare('Fojas',file.folios?.value,row.values.folios?.normalizedValue);compare('Contratante',file.contractor?.value,row.values.contractor?.normalizedValue);
  return{status:conflicts.length?'CONFLICT':partial?'PARTIAL_MATCH':'MATCHED',matches,conflicts,contractors};
}
export async function processMetadataBatches<T>(items:T[],options:{start?:number;batchSize:number;cancelled:()=>boolean;paused:()=>boolean;onBatch:(batch:T[],cursor:number)=>Promise<void>|void;yieldControl?:()=>Promise<void>}){
  let cursor=options.start??0;while(cursor<items.length&&!options.cancelled()&&!options.paused()){const end=Math.min(cursor+options.batchSize,items.length);await options.onBatch(items.slice(cursor,end),end);cursor=end;await(options.yieldControl?.()??Promise.resolve())}return{cursor,completed:cursor===items.length,cancelled:options.cancelled(),paused:options.paused()};
}
