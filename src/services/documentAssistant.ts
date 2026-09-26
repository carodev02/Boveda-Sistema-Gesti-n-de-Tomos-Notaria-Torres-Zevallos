import type {DocumentRecord} from '../data/repository';

export type DocumentAssistantIntent='conversation'|'help'|'filename'|'document-search'|'out-of-scope';
export type DocumentAssistantAnswer={
 answer:string;
 results:DocumentRecord[];
 recognized:boolean;
 searchOcr:boolean;
 intent:DocumentAssistantIntent;
};

const stop=new Set([
 'a','al','algo','ano','anos','aparece','aparezca','archivo','archivos','buscar','busca','con','contenido','cual','cuales','cuanta','cuantas','cuanto','cuantos','dame','de','del','dice','dime','documento','documentos','donde','el','en','encuentra','encontrar','es','esta','este','favor','hay','informacion','la','las','lista','listar','lo','los','me','muestra','muestrame','necesito','nombre','palabra','para','por','porfavor','que','quiero','sobre','son','texto','tiene','tienen','todos','todas','un','una','ver'
]);
const structural=new Set(['acto','archivo','archivos','bienio','cantidad','documento','documentos','escritura','escrituras','foja','kardex','minuta','minutas','nombre','pdf','registro','solicitud','tipo','tomo','tomos']);

const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/\s+/g,' ').trim();
const exactKey=(value:unknown)=>normalize(value).replace(/^kardex\s*/,'').replace(/^k(?=\d)/,'').replace(/^0+(?=\d)/,'');
const fileKey=(value:unknown)=>normalize(value).replace(/\.pdf$/,'').replace(/[^a-z0-9ñ]+/g,' ').replace(/\s+/g,' ').trim();
const distinct=(values:Array<string|number|undefined>)=>[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const plural=(count:number,singular:string,pluralForm=`${singular}s`)=>`${count} ${count===1?singular:pluralForm}`;
const metadata=(document:DocumentRecord)=>normalize([document.fileName,document.tipo,document.kardex,document.normalizedKardex,document.numeroMinuta,document.escritura,document.actoJuridico,document.tomo,document.ano,document.bienio,document.fecha,document.observaciones,...document.contratantes].join(' '));

function response(answer:string,results:DocumentRecord[],intent:DocumentAssistantIntent,searchOcr=false):DocumentAssistantAnswer{
 return {answer,results,recognized:true,searchOcr,intent};
}

function conversationAnswer(question:string){
 const q=normalize(question).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(hola|buenos dias|buenas tardes|buenas noches|buenas)( como estas| que tal)?$/.test(q))return '¡Hola! Puedo ayudarte a encontrar archivos y consultar la información registrada en Bóveda. Pídeme un archivo por su nombre, kardex, escritura, tomo, persona o contenido del PDF.';
 if(/^(gracias|muchas gracias|ok|okay|perfecto|entendido)$/.test(q))return 'Con gusto. Cuando quieras, dime qué archivo o dato documental necesitas.';
 if(/^(adios|hasta luego|nos vemos|chau)$/.test(q))return 'Hasta luego. Aquí estaré cuando necesites consultar los documentos de Bóveda.';
 return undefined;
}

function capabilityAnswer(question:string){
 const q=normalize(question).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(que puedes hacer|para que sirves|como me puedes ayudar|ayuda|ayudame)$/.test(q))return 'Puedo localizar un archivo por su nombre, kardex, escritura, minuta, tomo, periodo o persona; buscar palabras dentro del OCR; contar y listar registros; detectar datos faltantes; y explicar cómo digitalizar, buscar o eliminar documentos en Bóveda. No consulto información externa al sistema.';
 return undefined;
}

function outsideSystem(question:string){
 const q=normalize(question);
 return /\b(clima|temperatura|pronostico|noticias|receta|chiste|horoscopo|futbol|partido|presidente|capital de|traduce|traduccion|hora actual|fecha de hoy)\b/.test(q);
}

function cleanFileCandidate(value:string){
 return value.trim()
  .replace(/^[“”"']+|[“”"']+$/g,'')
  .replace(/^(?:por favor\s+)?(?:abre|busca|descarga|dame|encuentra|localiza|muestra|necesito|quiero)\s+(?:el|la|un|una)?\s*(?:archivo|documento|pdf)?\s*/i,'')
  .replace(/^(?:con\s+)?(?:el\s+)?(?:nombre|llamado|llamada|que\s+se\s+llama|se\s+llama)\s*/i,'')
  .replace(/\s+(?:por favor|porfa)$/i,'')
  .replace(/[?!.]+$/g,'')
  .trim();
}

function requestedFileName(question:string){
 const quoted=question.match(/[“"']([^”"']{2,})[”"']/)?.[1];
 if(quoted&&/archivo|documento|pdf|nombre|llamad/i.test(question))return cleanFileCandidate(quoted);
 const marked=question.match(/\b(?:archivo|documento|pdf)\s+(?:(?:con\s+)?(?:el\s+)?nombre\s+|llamad[oa]\s+|(?:que\s+)?se\s+llama\s+)(.+)$/i)?.[1];
 if(marked)return cleanFileCandidate(marked);
 const commanded=question.match(/\b(?:abre|busca|descarga|dame|encuentra|localiza|muestra|necesito|quiero)\s+(?:el|la|un|una)?\s*(?:archivo|documento|pdf)\s+(.+)$/i)?.[1];
 if(commanded)return cleanFileCandidate(commanded);
 if(/\.pdf\b/i.test(question))return cleanFileCandidate(question);
 return undefined;
}

function namedFileAnswer(question:string,documents:DocumentRecord[]){
 const requested=requestedFileName(question);
 if(!requested)return undefined;
 const key=fileKey(requested);
 if(key.length<2)return response('Indícame el nombre del archivo que necesitas.',[],'filename');
 const matches=documents.map(document=>{
  const documentKey=fileKey(document.fileName);
  const score=documentKey===key?3:documentKey.includes(key)?2:key.includes(documentKey)&&documentKey.length>3?1:0;
  return {document,score};
 }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.document.fileName.localeCompare(b.document.fileName,'es'));
 const exact=matches.filter(item=>item.score===3);
 const results=(exact.length?exact:matches).map(item=>item.document);
 if(results.length===1)return response(`Encontré el archivo “${results[0].fileName}”. Selecciónalo para abrirlo y revisar su contenido.`,results,'filename');
 if(results.length)return response(`Encontré ${plural(results.length,'archivo')} cuyo nombre coincide con “${requested}”. Selecciona el que necesitas.`,results,'filename');
 return response(`No encontré un archivo llamado “${requested}” dentro de Bóveda. Verifica el nombre o prueba con su kardex, escritura o una palabra del PDF.`,[],'filename');
}

function relationMissing(documents:DocumentRecord[],missing:'registro'|'origen'){
 const groups=new Map<string,DocumentRecord[]>();
 for(const document of documents){const kardex=exactKey(document.normalizedKardex??document.kardex);if(!kardex)continue;const key=[kardex,document.ano??document.bienio??'',document.tomo].join('|');groups.set(key,[...(groups.get(key)??[]),document])}
 return [...groups.values()].filter(rows=>{const types=rows.map(document=>normalize(document.tipo));const hasOrigin=types.some(type=>type.includes('minuta')||type==='solicitud');const hasRegistry=types.some(type=>!type.includes('minuta')&&type!=='solicitud');return missing==='registro'?hasOrigin&&!hasRegistry:hasRegistry&&!hasOrigin}).flat();
}

function missingAnswer(label:string,results:DocumentRecord[]){
 const kardexes=distinct(results.map(document=>document.normalizedKardex??document.kardex));
 return response(kardexes.length?`${plural(kardexes.length,'kardex','kardex')} ${label}: ${kardexes.join(', ')}.`:`No encontré kardex ${label}.`,results,'document-search');
}

function controlScope(question:string,documents:DocumentRecord[]){
 const q=normalize(question);let rows=[...documents];
 const biennium=q.match(/\b(\d{4})\s*[-–]\s*(\d{4})\b/)?.[0]?.replace(/\s/g,'');
 const year=q.match(/(?:año|ano)\s+(\d{4})\b/)?.[1]??(!biennium?q.match(/\b(?:19|20)\d{2}\b/)?.[0]:undefined);
 const tome=q.match(/\btomo\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardexCandidate=q.match(/\bkardex\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardex=kardexCandidate&&/\d/.test(kardexCandidate)&&!['de','del','en'].includes(kardexCandidate)?kardexCandidate:undefined;
 if(biennium)rows=rows.filter(document=>normalize(document.bienio)===biennium);
 else if(year)rows=rows.filter(document=>String(document.ano??'')===year||normalize(document.bienio).split('-').includes(year));
 if(tome)rows=rows.filter(document=>exactKey(document.tomo)===exactKey(tome));
 if(kardex)rows=rows.filter(document=>exactKey(document.normalizedKardex??document.kardex)===exactKey(kardex));
 return {rows,year,biennium,tome,kardex};
}

function filters(question:string,documents:DocumentRecord[]){
 const q=normalize(question);let rows=[...documents];let structuredQuery=false;
 const biennium=q.match(/\b(\d{4})\s*[-–]\s*(\d{4})\b/)?.[0]?.replace(/\s/g,'');
 const year=q.match(/(?:año|ano)\s+(\d{4})\b/)?.[1]??(!biennium?q.match(/\b(?:19|20)\d{2}\b/)?.[0]:undefined);
 const tome=q.match(/\btomo\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardexCandidate=q.match(/\bkardex\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardex=kardexCandidate&&/\d/.test(kardexCandidate)&&!['de','del','en'].includes(kardexCandidate)?kardexCandidate:undefined;
 const escrituraCandidate=q.match(/\bescritura\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const escritura=['de','del','en'].includes(escrituraCandidate??'')?undefined:escrituraCandidate;
 const minuteNumber=q.match(/\bminuta\s+(?:n(?:umero|ro)?\.?\s*)?(\d+)/)?.[1];
 if(biennium){structuredQuery=true;rows=rows.filter(document=>normalize(document.bienio)===biennium)}
 else if(year){structuredQuery=true;rows=rows.filter(document=>String(document.ano??'')===year||normalize(document.bienio).split('-').includes(year))}
 if(tome){structuredQuery=true;rows=rows.filter(document=>exactKey(document.tomo)===exactKey(tome))}
 if(kardex){structuredQuery=true;rows=rows.filter(document=>exactKey(document.normalizedKardex??document.kardex)===exactKey(kardex))}
 if(escritura){structuredQuery=true;rows=rows.filter(document=>exactKey(document.escritura)===exactKey(escritura))}
 if(q.includes('minuta')){structuredQuery=true;rows=rows.filter(document=>normalize(document.tipo).includes('minuta')||(minuteNumber?exactKey(document.numeroMinuta)===exactKey(minuteNumber):false))}
 const knownTypes=['solicitud','testamento','compraventa','compra-venta','poder','sucesion intestada','escritura publica'];
 const type=knownTypes.find(value=>q.includes(value));
 if(type){structuredQuery=true;const expected=type==='compra-venta'?'compraventa':type;rows=rows.filter(document=>metadata(document).includes(expected))}
 const excluded=new Set([year,tome,kardex,escritura,minuteNumber,...(biennium?[biennium,...biennium.split('-')]:[]),...(type?type.split(/\s|-/):[])].filter((value):value is string=>Boolean(value)));
 const terms=q.split(/[^a-z0-9ñ-]+/).filter(term=>term.length>2&&!stop.has(term)&&!structural.has(term)&&!excluded.has(term));
 if(terms.length)rows=rows.filter(document=>terms.every(term=>metadata(document).includes(term)));
 return {q,rows,recognized:structuredQuery||terms.length>0,structuredQuery,terms,year,biennium,tome,kardex};
}

function howToAnswer(question:string){
 const q=normalize(question);
 if(!/\b(como|ayuda|pasos|explica)\b/.test(q))return undefined;
 if(/subir|cargar|digitaliz/.test(q))return 'Para registrar un PDF, abre Digitalización, selecciona la clase documental y el archivo, revisa el OCR y los datos detectados, y confirma el guardado. Si el archivo ya existe, revisa el documento registrado antes de volver a cargarlo.';
 if(/buscar|encontrar|localizar/.test(q))return 'Puedes buscar en Gestión Documental por nombre de archivo, kardex, contratante, escritura, tomo o periodo. Aquí también puedes preguntar por esos datos o por palabras que aparezcan en el texto OCR.';
 if(/eliminar|borrar/.test(q))return 'En Gestión Documental, abre las acciones del archivo y elige Eliminar. Selecciona el motivo; Documento duplicado y Documento incorrecto eliminan también el PDF para permitir una nueva carga.';
 return undefined;
}

export function answerDocumentQuestion(question:string,documents:DocumentRecord[],scopedId?:number):DocumentAssistantAnswer{
 const conversation=conversationAnswer(question);
 if(conversation)return response(conversation,[],'conversation');
 const capabilities=capabilityAnswer(question);
 if(capabilities)return response(capabilities,[],'help');
 const howTo=howToAnswer(question);
 if(howTo)return response(howTo,[],'help');
 if(outsideSystem(question))return response('Esa solicitud no corresponde a la información disponible en Bóveda. Puedo ayudarte con archivos, kardex, escrituras, tomos, personas registradas, OCR y funciones del sistema.',[],'out-of-scope');

 if(scopedId){
  const results=documents.filter(document=>document.id===scopedId);
  return response(results.length?'Encontré el documento seleccionado. Puedes consultarlo mediante sus datos registrados y el texto OCR disponible.':'No encontré el documento seleccionado.',results,'document-search');
 }

 const namedFile=namedFileAnswer(question,documents);
 if(namedFile)return namedFile;

 const normalizedQuestion=normalize(question);
 const scoped=controlScope(question,documents);
 const scopeLabel=scoped.year?` en el año ${scoped.year}`:scoped.biennium?` en el bienio ${scoped.biennium}`:'';
 if(normalizedQuestion.includes('qr')&&/(?:sin|no (?:tiene|tienen)|falta|faltan)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.qrUrl&&!document.qrRawValue);return response(`Encontré ${plural(results.length,'documento')} sin QR detectado${scopeLabel}.`,results,'document-search')}
 if(/(?:falta|faltan|sin).*(?:acta|escritura|registro notarial)/.test(normalizedQuestion))return missingAnswer(`sin acta o Registro Notarial relacionado${scopeLabel}`,relationMissing(scoped.rows,'registro'));
 if(/(?:falta|faltan|sin).*minuta/.test(normalizedQuestion))return missingAnswer(`sin Minuta o Solicitud relacionada${scopeLabel}`,relationMissing(scoped.rows,'origen'));
 if(/(?:ocr|lectura).*(?:pendiente|falta|faltan|sin)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>{const status=normalize(document.ocr);return !status||status.includes('pendiente')||status.includes('no proces')});return response(`Encontré ${plural(results.length,'documento')} con OCR pendiente o sin procesar${scopeLabel}.`,results,'document-search')}
 if(/(?:ocr|lectura).*(?:error|fall)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>/error|fall/.test(normalize(document.ocr)));return response(`Encontré ${plural(results.length,'documento')} con error de OCR${scopeLabel}.`,results,'document-search')}
 if(/(?:sin|falta|faltan).*(?:acto juridico|acto)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.actoJuridico.trim());return response(`Encontré ${plural(results.length,'documento')} sin acto jurídico registrado${scopeLabel}.`,results,'document-search')}
 if(/(?:sin|falta|faltan).*(?:contratante|solicitante)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.contratantes.length);return response(`Encontré ${plural(results.length,'documento')} sin contratante o solicitante registrado${scopeLabel}.`,results,'document-search')}

 const query=filters(question,documents);const {q,rows}=query;
 if(/cuant[oa]s?/.test(q)&&/\btomos?\b/.test(q)){const tomes=distinct(rows.map(document=>document.tomo));const scope=query.year?` en el año ${query.year}`:query.biennium?` en el bienio ${query.biennium}`:'';return response(`Hay ${plural(tomes.length,'tomo')}${scope}${tomes.length?`: ${tomes.join(', ')}.`:'.'}`,rows,'document-search')}
 if(/(?:dame|lista|listar|muestra|cuales)/.test(q)&&/\bkardex\b/.test(q)){const kardexes=distinct(rows.map(document=>document.normalizedKardex??document.kardex));const scope=query.tome?` del tomo ${query.tome}`:'';return response(kardexes.length?`Encontré ${plural(kardexes.length,'kardex','kardex')}${scope}: ${kardexes.join(', ')}.`:`No encontré kardex${scope}.`,rows,'document-search')}
 if(/(?:dame|lista|listar|muestra|cuales)/.test(q)&&/\btomos?\b/.test(q)){const tomes=distinct(rows.map(document=>document.tomo));return response(tomes.length?`Tomos encontrados: ${tomes.join(', ')}.`:'No encontré tomos con esos criterios.',rows,'document-search')}
 if(/cuant[oa]s?/.test(q)){return response(`Encontré ${plural(rows.length,'documento')}${query.year?` en el año ${query.year}`:''}${query.tome?` en el tomo ${query.tome}`:''}.`,rows,'document-search')}
 if(/(?:dame|lista|listar|muestra|cuales)/.test(q)&&/\b(?:archivos?|documentos?)\b/.test(q)){return response(`Encontré ${plural(rows.length,'documento')} con los criterios indicados.`,rows,'document-search')}
 if(!query.recognized)return response('No identifiqué una solicitud documental concreta. Pídeme un archivo por su nombre, kardex, escritura, tomo, persona o una palabra que aparezca en el PDF.',[],'out-of-scope');
 if(!rows.length&&query.structuredQuery)return response('No encontré documentos registrados que coincidan con esos datos. Verifica el nombre, kardex, escritura, tomo o periodo indicado.',[],'document-search');
 if(!rows.length)return {answer:'No encontré coincidencias en los datos registrados. Revisaré también el texto OCR de los PDF.',results:[],recognized:true,searchOcr:true,intent:'document-search'};
 if(q.includes('minuta')&&query.kardex)return response(`Encontré ${plural(rows.length,'minuta')} del kardex ${query.kardex}.`,rows,'document-search');
 return response(`Encontré ${plural(rows.length,'documento')} coincidentes dentro de Bóveda. Los resultados mostrados son las fuentes utilizadas.`,rows,'document-search');
}
