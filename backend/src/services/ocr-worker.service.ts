import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prisma} from '../config/prisma.js';
import {env} from '../config/env.js';

const root=path.resolve(env.STORAGE_ROOT);
const vision=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..','..','src-tauri','vision');
const worker=path.join(vision,'processor.py');
const pending:string[]=[];
let activeJobId:string|undefined;
type OcrResultPage={pageNumber?:number;rawText?:string;averageConfidence?:number;engine?:string};
type PersistedField={fieldName:string;extractedValue:string;normalizedValue:string;confidence:number;requiresReview:boolean;sourcePage?:number;sourceText?:string};

const repairOcrText=(value:string)=>value.normalize('NFC').replace(/ZU�IGA/gi,'ZUÑIGA').replace(/SE�OR/gi,'SEÑOR').replace(/ACI�N/gi,'ACIÓN').replace(/�/g,' ').replace(/\s+/g,' ').trim();
const evidence=(page:OcrResultPage,match:RegExpMatchArray)=>repairOcrText(String(page.rawText??'').slice(Math.max(0,(match.index??0)-35),(match.index??0)+match[0].length+55));
export function extractScanFields(pages:OcrResultPage[]):PersistedField[]{
  const normalized=pages.map(page=>({...page,text:repairOcrText(String(page.rawText??''))}));
  const find=(pattern:RegExp)=>{for(const page of normalized){const match=page.text.match(pattern);if(match)return {page,match,value:repairOcrText(match[1]??match[0])}}};
  const make=(fieldName:string,hit:ReturnType<typeof find>,confidence=.82,normalizedValue=hit?.value??''):PersistedField=>({fieldName,extractedValue:hit?.value??'',normalizedValue,confidence:hit?confidence:0,requiresReview:!hit||confidence<.8,sourcePage:hit?.page.pageNumber,sourceText:hit?evidence(hit.page,hit.match):undefined});
  const kardex=find(/(?:kardex_header|k[\s.]*a[\s.]*r[\s.]*d[\s.]*[eé][\s.]*x|karoex|kard[.]|código\s+kardex)\s*(?:n(?:úmero|ro|[.º°])?\s*)?[:.-]?\s*([a-z]{0,3}-?[0-9]{1,8})/i);
  const minute=find(/(?:minute_header|minu[t7]a\s*(?:n(?:úmero|ro|[.º°])?\s*)|n(?:úmero|ro)[.]?\s+de\s+minuta\s*)[:.-]?\s*([0-9]{1,8})/i);
  const folio=find(/(?:fojas?|folios?)\s*(?:n(?:úmero|ro|[.º°])?\s*)?[:.-]?\s*([0-9]{1,8})/i);
  const instrument=find(/\b(poder\s+especial|transferencia\s+vehicular|constitución\s+de\s+empresa|testamento|acta)(?:\s+n(?:úmero|ro|[.º°])?\s*[:.-]?\s*([0-9]{1,8}))?/i)??find(/\b(escritura(?:\s+pública)?|poder|instrumento)(?:\s+n(?:úmero|ro|[.º°])?\s*[:.-]?\s*([0-9]{1,8}))?/i);
  const contractor=find(/a\s+favor\s+de\s+((?:don|doña)\s+[a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,5})(?=\s*,|\s+de\s+nacionalidad|\s+identificad)/i)??find(/(?:otorga(?:nte)?|contratante|comparece)\s*(?:don|doña)?\s*[:.-]?\s*((?:don|doña)?\s*[a-záéíóúñü]+(?:\s+[a-záéíóúñü]+){1,5})(?=\s*,|\s+de\s+nacionalidad|\s+identificad)/i);
  const date=find(/(?:fecha\s*[:.-]?\s*|a\s+los\s+)((?:[0-3]?\d[/-][01]?\d[/-](?:19|20)\d{2})|(?:[0-3]?\d\s+de\s+[a-záéíóú]+\s+de\s+(?:19|20)\d{2}))/i);
  const legal=find(/\b(compraventa|donación|poder\s+especial|hipoteca|transferencia\s+vehicular|constitución\s+de\s+empresa|testamento)\b/i);
  const registryValue=instrument?/poder/i.test(instrument.value)?'poderes':/acta/i.test(instrument.value)?'actas':/testamento/i.test(instrument.value)?'testamentos':'escrituras-publicas':'';
  const legalValue=legal?.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-')??'';
  return [
    make('kardexNumber',kardex,.86,kardex?.value.toUpperCase().replace(/^0+(?=\d)/,'')??''),
    make('minuteNumber',minute),make('printedFolio',folio),
    make('destinationRegistryType',instrument,.88,registryValue),
    make('destinationInstrumentNumber',instrument?.match[2]?instrument:undefined,.84,instrument?.match[2]??''),
    make('instrumentType',instrument,.88,instrument?.match[1]?.toUpperCase()??''),
    make('instrumentNumber',instrument?.match[2]?instrument:undefined,.84,instrument?.match[2]??''),
    make('documentDate',date,.78,date?.value??''),make('legalAct',legal,.9,legalValue),
    make('primaryContractor',contractor,.84,contractor?.value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑÜ .'-]/g,'').replace(/\s+/g,' ').trim()??''),
  ];
}

export async function enqueueOcrJob(jobId:string){const job=await prisma.documentProcessingJob.findUnique({where:{id:jobId}});if(!job)throw new Error('Trabajo documental inexistente.');if(['OCR_PROCESSING','REVIEW_REQUIRED','COMPLETED'].includes(job.status))return {jobId,status:job.status};if(activeJobId){if(!pending.includes(jobId))pending.push(jobId);await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PENDING'}});return {jobId,status:'OCR_PENDING'}}activeJobId=jobId;await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PROCESSING',errorMessage:null}});void runOcr(jobId,path.resolve(root,job.temporaryPath));return {jobId,status:'OCR_PROCESSING'}}
async function startNext(){activeJobId=undefined;const jobId=pending.shift();if(!jobId)return;const job=await prisma.documentProcessingJob.findUnique({where:{id:jobId}});if(!job||job.status==='CANCELLED'){void startNext();return}activeJobId=jobId;await prisma.documentProcessingJob.update({where:{id:jobId},data:{status:'OCR_PROCESSING',errorMessage:null}});void runOcr(jobId,path.resolve(root,job.temporaryPath))}
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
    child.stdout.on('data',chunk=>{output=(output+chunk.toString()).slice(-10_000_000)});child.stderr.on('data',chunk=>{const line=sanitize(chunk.toString());if(line)console.info(`${line} job=${jobId}`);error=(error+chunk.toString()).slice(-4000)});
    child.on('error',reason=>{spawnFailed=true;void failJob(jobId,`OCR_ENGINE_FAILED: ${sanitize(reason.message)}`).finally(()=>startNext())});
    child.on('close',async code=>{if(spawnFailed)return;try{if(code!==0)throw new Error(sanitize(error)||'OCR_ENGINE_FAILED: El worker OCR terminó con error.');const result=JSON.parse(output) as {pages?:OcrResultPage[]};const pages=result.pages??[];if(!pages.length)throw new Error('OCR_RESULT_EMPTY: El worker no devolvió páginas.');const fields=extractScanFields(pages);await prisma.$transaction(async tx=>{await tx.ocrPage.deleteMany({where:{jobId}});await tx.ocrField.deleteMany({where:{jobId}});for(const page of pages)try{await tx.ocrPage.create({data:{jobId,pageNumber:Number(page.pageNumber),text:String(page.rawText??''),confidence:Number(page.averageConfidence??0),engine:String(page.engine??'tesseract')}})}catch{throw new Error(`OCR_PAGE_SAVE_FAILED: No se pudo guardar la página ${page.pageNumber}.`)}if(fields.length)await tx.ocrField.createMany({data:fields.map(field=>({...field,jobId}))});await tx.documentProcessingJob.update({where:{id:jobId},data:{status:'REVIEW_REQUIRED',errorMessage:null}})});}catch(reason){await failJob(jobId,reason instanceof Error?reason.message:String(reason))}finally{void startNext()}});
  }catch(reason){await failJob(jobId,reason instanceof Error?reason.message:String(reason));void startNext()}
}
