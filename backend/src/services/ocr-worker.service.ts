import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';

const root=path.resolve(env.STORAGE_ROOT);
// Resolve from configuration instead of from this source file. The latter changes
// when TypeScript is compiled into dist/ and made production OCR look in
// backend/src-tauri/vision, which does not exist.
const vision=path.resolve(env.VISION_ROOT);
const worker=path.join(vision,'processor.py');
const pending:string[]=[];
const activeJobs=new Set<string>();
const maxWorkers=Math.max(1,Math.min(Number(process.env.OCR_JOB_WORKERS)||Math.max(1,Math.floor((Number(process.env.NUMBER_OF_PROCESSORS)||2)/2)),4));
export type OcrProgress={processedPages:number;totalPages:number;progress:number;elapsedSeconds:number;estimatedSecondsRemaining:number;failedPages:number};
const progressByJob=new Map<string,OcrProgress>();
export const getOcrProgress=(jobId:string)=>progressByJob.get(jobId);
type OcrResultPage={pageNumber?:number;rawText?:string;averageConfidence?:number;engine?:string};
type PersistedField={fieldName:string;extractedValue:string;normalizedValue:string;confidence:number;requiresReview:boolean;sourcePage?:number;sourceText?:string};
export type QrDetection={qrDetected?:boolean;qrRawValue?:string;qrUrl?:string|null;pageNumber?:number;boundingBox?:{x:number;y:number;width:number;height:number};requiresReview?:boolean;decoder?:string;variant?:string};

export function normalizeQrUrl(value:unknown){
  const text=String(value??'').trim();
  const candidate=text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[),.;]+$/,'');
  if(!candidate)return undefined;
  try{const parsed=new URL(candidate);return ['http:','https:'].includes(parsed.protocol)&&Boolean(parsed.hostname)?parsed.toString():undefined}catch{return undefined}
}

const repairOcrText=(value:string)=>value.normalize('NFC').replace(/ZU�IGA/gi,'ZUÑIGA').replace(/SE�OR/gi,'SEÑOR').replace(/ACI�N/gi,'ACIÓN').replace(/�/g,' ').replace(/\s+/g,' ').trim();
const normalizeOcrDate=(value:string)=>{const numeric=value.match(/^(\d{1,2})[/-](\d{1,2})[/-]((?:19|20)\d{2})$/);if(numeric)return `${numeric[3]!}-${numeric[2]!.padStart(2,'0')}-${numeric[1]!.padStart(2,'0')}`;const words=value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').match(/^(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\s+(?:de\s+)?((?:19|20)\d{2})$/);if(!words)return value;const months=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];const month=months.findIndex(item=>words[2]!.startsWith(item));return month<0?value:`${words[3]!}-${String(month+1).padStart(2,'0')}-${words[1]!.padStart(2,'0')}`};
const evidence=(page:OcrResultPage,match:RegExpMatchArray)=>repairOcrText(String(page.rawText??'').slice(Math.max(0,(match.index??0)-35),(match.index??0)+match[0].length+55));
export function extractScanFields(pages:OcrResultPage[]):PersistedField[]{
  const normalized=pages.map(page=>({...page,text:repairOcrText(String(page.rawText??''))}));
  const find=(pattern:RegExp)=>{for(const page of normalized){const match=page.text.match(pattern);if(match)return {page,match,value:repairOcrText(match[1]??match[0])}}};
  const make=(fieldName:string,hit:ReturnType<typeof find>,confidence=.82,normalizedValue=hit?.value??''):PersistedField=>({fieldName,extractedValue:hit?.value??'',normalizedValue,confidence:hit?confidence:0,requiresReview:!hit||confidence<.8,sourcePage:hit?.page.pageNumber,sourceText:hit?evidence(hit.page,hit.match):undefined});
  const numberLabel=String.raw`n(?:[úu]mero|ro|[º°]|\.\s*[º°])?`;
  const kardex=find(new RegExp(String.raw`(?:kardex_header|k[\s.]*a[\s.]*r[\s.]*d[\s.]*[eé][\s.]*x|karoex|kard[.]|código\s+kardex)\s*(?:${numberLabel}\s*)?[:.-]?\s*([a-z]{0,3}-?[0-9]{1,8})`,'i'))??find(/\bk\s*[-:]\s*([0-9]{3,8})\b/i);
  const minute=find(new RegExp(String.raw`(?:minute_header|minu[t7]a\s*(?:${numberLabel}\s*)|${numberLabel}[.]?\s+de\s+minuta\s*)[:.-]?\s*([0-9]{1,8})`,'i'));
  const folio=find(new RegExp(String.raw`(?:fojas?|folios?)\s*(?:${numberLabel}\s*)?[:.-]?\s*([0-9]{1,8})`,'i'));
  const instrument=find(new RegExp(String.raw`\b(poder\s+especial|transferencia\s+vehicular|constitución\s+de\s+empresa|testamento|acta)(?:\s+${numberLabel}\s*[:.-]?\s*([0-9]{1,8}))?`,'i'))??find(new RegExp(String.raw`\b(escritura(?:\s+pública)?|poder|instrumento)(?:\s+${numberLabel}\s*[:.-]?\s*([0-9]{1,8}))?`,'i'));
  const nameStop=String.raw`(?=\s*(?:,|\.|\$|a\s+favor\s+de|y\s+(?:don|doña|do\s+a)\b|por\s+su\s+propio\s+derecho|identificad[oa]?\s+con|de\s+nacionalidad|domiciliad[oa]?\s+en|con\s+domicilio|quien\s+comparece|$))`;
  const namedPerson=String.raw`(?:don|doña|do\s+a)\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){2,6})`;
  const grantingContractor=find(new RegExp(String.raw`(?:que\s+otorga|otorgante|otorgad[oa]\s+por)\s*[:.-]?\s*${namedPerson}${nameStop}`,'i'));
  const grantingNames=normalized.flatMap(page=>{
    const section=page.text.match(/(?:que\s+otorga|otorgante|otorgad[oa]\s+por)\s*[:.-]?\s*([\s\S]{0,260}?)(?=\s+a\s+favor\s+de\b|$)/i)?.[1];
    if(!section)return [];
    const pattern=/(?:don|doña|do\s+a)\s+([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){2,6}?)(?=\s+(?:y\s+(?:don|doña|do\s+a)\b|a\s+favor\s+de\b)|\s*[,.$]|$)/gi;
    return [...section.matchAll(pattern)].map(match=>repairOcrText(match[1]??''));
  });
  const appearingContractor=find(new RegExp(String.raw`comparecen?\s*[:.-]?\s*${namedPerson}${nameStop}`,'i'));
  const labelledContractor=find(new RegExp(String.raw`(?:vendedor(?:a)?|comprador(?:a)?|contratante)\s*[:.-]?\s*${namedPerson}${nameStop}`,'i'));
  const sellerForm=find(/(?:datos\s+del\s+vendedor[\s\S]{0,220}?)?nombre\s+y\s+apellidos\s*:\s*([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,6})(?=\s+(?:domicilio|profesi[oó]n|ocupaci[oó]n|documento\s+de\s+identidad|estado\s+civil))/i);
  const declarant=find(/\byo\s*[,.:]?\s*([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,6})(?=\s+(?:identificad[oa]|de\s+nacionalidad|con\s+dni))/i);
  const beneficiaryContractor=find(new RegExp(String.raw`a\s+favor\s+de\s+${namedPerson}${nameStop}`,'i'));
  const legacyContractor=find(new RegExp(String.raw`(?:otorgante|contratante)\s*[:.-]?\s*([a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,5})${nameStop}`,'i'));
  const multipleGrantors=grantingNames.length>1;
  const date=find(/(?:fecha\s*[:.-]?\s*|a\s+los\s+)((?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2})|(?:[0-3]?\d\s+(?:de\s+)?[a-záéíóú]{3,10}\s+(?:de\s+)?(?:19|20)\d{2}))/i);
  const legal=find(/\b(compraventa|donación|poder\s+especial|hipoteca|transferencia\s+vehicular|constitución\s+de\s+empresa|testamento)\b/i);
  const registryValue=instrument?/poder/i.test(instrument.value)?'poderes':/acta/i.test(instrument.value)?'actas':/testamento/i.test(instrument.value)?'testamentos':'escrituras-publicas':'';
  const directedKardex=find(/KARDEX_HEADER\s+([A-Z]{0,3}-?\d{1,8})/i);
  const directedMinute=find(/MINUTE_HEADER\s+(\d{1,8})/i);
  const explicitInstrumentNumber=find(new RegExp(String.raw`(?:escritura(?:\s+pública)?|instrumento|e\s*[.]\s*p\s*[.]?)\s*(?:${numberLabel}\s*)?[:.-]?\s*([0-9]{1,8})`,'i'))??find(/(?:^|\s)E\s*[.:º°-]\s*(\d{1,8})(?=\s|$)/i);
  const explicitInstrumentType=find(/\b(poder\s+especial|transferencia\s+vehicular|constitución\s+de\s+empresa|testamento|acta|escritura\s+pública|poder)\b/i);
  const completeContractor=grantingContractor?(multipleGrantors?{...grantingContractor,value:grantingNames.join('; ')}:grantingContractor):appearingContractor??labelledContractor??sellerForm??declarant??beneficiaryContractor??legacyContractor;
  const contractorConfidence=grantingContractor?0.9:appearingContractor?0.78:labelledContractor?0.76:sellerForm?0.92:declarant?0.76:beneficiaryContractor?0.82:legacyContractor?0.76:0;
  const completeDate=date??find(/(?:lima|callao)\s*,?\s*(?:a\s+)?los?\s+((?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2})|(?:[0-3]?\d\s+(?:de\s+)?[a-záéíóú]{3,10}\s+(?:de\s+)?(?:19|20)\d{2}))/i);
  const selectedKardex=directedKardex??kardex,selectedMinute=directedMinute??minute,selectedInstrumentNumber=explicitInstrumentNumber??(instrument?.match[2]?instrument:undefined),selectedInstrumentType=explicitInstrumentType??instrument;
  const selectedRegistryValue=selectedInstrumentType?/poder/i.test(selectedInstrumentType.value)?'poderes':/acta/i.test(selectedInstrumentType.value)?'actas':/testamento/i.test(selectedInstrumentType.value)?'testamentos':'escrituras-publicas':selectedInstrumentNumber?'escrituras-publicas':registryValue;
  const legalValue=legal?.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-')??'';
  return [
    make('kardexNumber',selectedKardex,.86,selectedKardex?.value.toUpperCase().replace(/^[A-Z]{1,3}-?(?=\d)/,'').replace(/^0+(?=\d)/,'')??''),
    make('minuteNumber',selectedMinute),make('printedFolio',folio),
    make('destinationRegistryType',selectedInstrumentType??selectedInstrumentNumber,.88,selectedRegistryValue),
    make('destinationInstrumentNumber',selectedInstrumentNumber,.84,selectedInstrumentNumber?.value??''),
    make('instrumentType',selectedInstrumentType,.88,selectedInstrumentType?.value.toUpperCase()??''),
    make('instrumentNumber',selectedInstrumentNumber,.84,selectedInstrumentNumber?.value??''),
    make('documentDate',completeDate,.78,completeDate?normalizeOcrDate(completeDate.value):''),make('legalAct',legal,.9,legalValue),
    make('primaryContractor',completeContractor,contractorConfidence,completeContractor?.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑÜ; .'-]/g,'').replace(/\s+/g,' ').trim()??''),
  ];
}

export function qrDetectionFields(detections:QrDetection[]):PersistedField[]{
  return detections.flatMap(detection=>{
    const raw=String(detection.qrRawValue??'').trim();
    if(!detection.qrDetected||!raw)return [];
    const qrUrl=normalizeQrUrl(detection.qrUrl??raw);
    const page=Number(detection.pageNumber)||undefined;
    const review=Boolean(detection.requiresReview||!qrUrl);
    const evidence=`QR decodificado con ${detection.decoder??'lector dedicado'}${detection.variant?` (${detection.variant})`:''}.`;
    const fields:PersistedField[]=[
      {fieldName:'qrDetected',extractedValue:'true',normalizedValue:'true',confidence:1,requiresReview:false,sourcePage:page,sourceText:evidence},
      {fieldName:'qrRawValue',extractedValue:raw,normalizedValue:raw,confidence:1,requiresReview:review,sourcePage:page,sourceText:evidence},
      {fieldName:'qrPageNumber',extractedValue:String(page??''),normalizedValue:String(page??''),confidence:1,requiresReview:false,sourcePage:page,sourceText:evidence},
      {fieldName:'qrBoundingBox',extractedValue:JSON.stringify(detection.boundingBox??{}),normalizedValue:JSON.stringify(detection.boundingBox??{}),confidence:1,requiresReview:false,sourcePage:page,sourceText:evidence},
    ];
    if(qrUrl)fields.push({fieldName:'qrUrl',extractedValue:qrUrl,normalizedValue:qrUrl,confidence:1,requiresReview:false,sourcePage:page,sourceText:evidence});
    return fields;
  });
}

async function reuseCachedResult(jobId:string,fileHash:string){const cached=await prisma.documentProcessingJob.findFirst({where:{id:{not:jobId},fileHash,status:{in:['REVIEW_REQUIRED','COMPLETED']}},orderBy:{updatedAt:'desc'},include:{ocrPages:true,ocrFields:true}});if(!cached?.ocrPages.length)return false;await prisma.$transaction(async tx=>{await tx.ocrPage.createMany({data:cached.ocrPages.map(page=>({jobId,pageNumber:page.pageNumber,text:page.text,confidence:page.confidence,engine:`cache:${page.engine}`}))});if(cached.ocrFields.length)await tx.ocrField.createMany({data:cached.ocrFields.map(field=>({jobId,fieldName:field.fieldName,extractedValue:field.extractedValue,normalizedValue:field.normalizedValue,confidence:field.confidence,requiresReview:field.requiresReview,sourcePage:field.sourcePage,sourceText:field.sourceText}))});await tx.documentProcessingJob.update({where:{id:jobId},data:{status:'REVIEW_REQUIRED',errorMessage:null}})});progressByJob.set(jobId,{processedPages:cached.pageCount,totalPages:cached.pageCount,progress:100,elapsedSeconds:0,estimatedSecondsRemaining:0,failedPages:0});return true}
export async function enqueueOcrJob(jobId:string){const job=await prisma.documentProcessingJob.findUnique({where:{id:jobId}});if(!job)throw new Error('Trabajo documental inexistente.');if(['OCR_PROCESSING','REVIEW_REQUIRED','COMPLETED'].includes(job.status))return {jobId,status:job.status};if(await reuseCachedResult(jobId,job.fileHash))return {jobId,status:'REVIEW_REQUIRED'};if(activeJobs.size>=maxWorkers){if(!pending.includes(jobId))pending.push(jobId);await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PENDING'}});return {jobId,status:'OCR_PENDING'}}await launch(job);return {jobId,status:'OCR_PROCESSING'}}
export async function recoverOcrQueue(){
  const jobs=await prisma.documentProcessingJob.findMany({where:{status:{in:['OCR_PENDING','OCR_PROCESSING']}},orderBy:{createdAt:'asc'},select:{id:true}});
  if(!jobs.length)return 0;
  await prisma.documentProcessingJob.updateMany({where:{id:{in:jobs.map(job=>job.id)}},data:{status:'OCR_PENDING'}});
  for(const job of jobs)await enqueueOcrJob(job.id);
  return jobs.length;
}
async function launch(job:{id:string;temporaryPath:string}){activeJobs.add(job.id);progressByJob.set(job.id,{processedPages:0,totalPages:0,progress:0,elapsedSeconds:0,estimatedSecondsRemaining:0,failedPages:0});await prisma.documentProcessingJob.update({where:{id:job.id},data:{status:'OCR_PROCESSING',errorMessage:null}});void runOcr(job.id,path.resolve(root,job.temporaryPath))}
async function startNext(completedJobId?:string){if(completedJobId)activeJobs.delete(completedJobId);while(activeJobs.size<maxWorkers){const jobId=pending.shift();if(!jobId)return;const job=await prisma.documentProcessingJob.findUnique({where:{id:jobId}});if(!job||job.status==='CANCELLED')continue;await launch(job)}}
const exists=async(value:string)=>fs.access(value).then(()=>true).catch(()=>false);
const sanitize=(value:string)=>value.replaceAll(root,'[storage]').replaceAll(process.cwd(),'[app]').replace(/[\r\n]+/g,' ').slice(-1200).trim();
async function runtime(){const pythonCandidates=[process.env.PYTHON_EXECUTABLE,path.join(vision,'.venv','Scripts','python.exe'),path.join(vision,'.venv','bin','python'),'python'].filter(Boolean) as string[];const checkedPython=await Promise.all(pythonCandidates.map(async candidate=>({candidate,valid:candidate==='python'||await exists(candidate)})));const python=checkedPython.find(item=>item.valid)?.candidate??'python';const tesseractCandidates=[process.env.TESSERACT_EXECUTABLE,'C:\\Program Files\\Tesseract-OCR\\tesseract.exe','C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'].filter(Boolean) as string[];const checkedTesseract=await Promise.all(tesseractCandidates.map(async candidate=>({candidate,valid:await exists(candidate)})));return {python,tesseract:checkedTesseract.find(item=>item.valid)?.candidate}}
async function failJob(jobId:string,technical:string){const match=/\b([A-Z][A-Z_]+):\s*(.*)/.exec(technical);const errorCode=match?.[1]??'OCR_ENGINE_FAILED';const message=sanitize(match?.[2]??technical);console.error(`[OCR] Fallo job=${jobId} errorCode=${errorCode} detail=${message}`);await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'FAILED',errorMessage:`${errorCode}: ${message}`}}).catch(()=>undefined)}
async function runOcr(jobId:string,source:string){
  const session=path.join(root,'ocr-sessions',jobId);await fs.mkdir(session,{recursive:true});
  try{
    const stat=await fs.stat(source).catch(()=>undefined);if(!stat?.isFile())throw new Error('TEMP_UPLOAD_NOT_FOUND: No existe la carga temporal.');if(stat.size<=0)throw new Error('PDF_OPEN_FAILED: El PDF temporal está vacío.');
    const handle=await fs.open(source,'r');const signature=Buffer.alloc(4);await handle.read(signature,0,4,0);await handle.close();if(signature.toString()!=='%PDF')throw new Error('PDF_OPEN_FAILED: La carga temporal no es un PDF válido.');
    console.info(`[OCR] PDF encontrado job=${jobId}`);console.info(`[OCR] Tamaño válido job=${jobId} bytes=${stat.size}`);
    const selected=await runtime();console.info(`[OCR] Worker iniciado job=${jobId}`);console.info(`[OCR] Python utilizado: ${path.basename(selected.python)}`);if(!selected.tesseract)throw new Error('TESSERACT_NOT_FOUND: No se encontró el ejecutable de Tesseract.');
    const child=spawn(selected.python,[worker,'recognize','--source',source,'--session',session],{windowsHide:true,env:{...process.env,TESSERACT_EXECUTABLE:selected.tesseract}});let output='';let error='';let spawnFailed=false;
    child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-10_000_000)});let stderrBuffer='';child.stderr.on('data',chunk=>{stderrBuffer+=chunk.toString();const lines=stderrBuffer.split(/\r?\n/);stderrBuffer=lines.pop()??'';for(const raw of lines){if(raw.startsWith('PROGRESS ')){try{progressByJob.set(jobId,JSON.parse(raw.slice(9)) as OcrProgress)}catch{/* Se ignora únicamente una actualización de progreso malformada. */}continue}const line=sanitize(raw);if(line)console.info(`${line} job=${jobId}`)}error=(error+chunk.toString()).slice(-4000)});
    child.on('error',reason=>{spawnFailed=true;void failJob(jobId,`OCR_ENGINE_FAILED: ${sanitize(reason.message)}`).finally(()=>startNext(jobId))});
    child.on('close',async code=>{if(spawnFailed)return;try{if(code!==0)throw new Error(sanitize(error)||'OCR_ENGINE_FAILED: El worker OCR terminó con error.');const result=JSON.parse(output) as {pages?:OcrResultPage[];qrCodes?:QrDetection[];metrics?:Record<string,unknown>};const pages=result.pages??[];if(!pages.length)throw new Error('OCR_RESULT_EMPTY: El worker no devolvió páginas.');const fields=[...extractScanFields(pages),...qrDetectionFields(result.qrCodes??[])];await prisma.$transaction(async tx=>{await tx.ocrPage.deleteMany({where:{jobId}});await tx.ocrField.deleteMany({where:{jobId}});for(const page of pages)try{await tx.ocrPage.create({data:{jobId,pageNumber:Number(page.pageNumber),text:String(page.rawText??''),confidence:Number(page.averageConfidence??0),engine:String(page.engine??'tesseract')}})}catch{throw new Error(`OCR_PAGE_SAVE_FAILED: No se pudo guardar la página ${page.pageNumber}.`)}if(fields.length)await tx.ocrField.createMany({data:fields.map(field=>({...field,jobId}))});await tx.documentProcessingJob.update({where:{id:jobId},data:{status:'REVIEW_REQUIRED',errorMessage:null}})});console.info(`[OCR] Métricas job=${jobId} ${JSON.stringify(result.metrics??{})}`);}catch(reason){await failJob(jobId,reason instanceof Error?reason.message:String(reason))}finally{void startNext(jobId)}});
  }catch(reason){await failJob(jobId,reason instanceof Error?reason.message:String(reason));void startNext(jobId)}
}
