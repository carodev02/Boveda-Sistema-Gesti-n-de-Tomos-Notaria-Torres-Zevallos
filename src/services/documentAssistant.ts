import type {DocumentRecord} from '../data/repository';

export type DocumentAssistantAnswer={answer:string;results:DocumentRecord[];recognized:boolean};

const stop=new Set(['a','al','ano','año','años','dame','de','del','el','en','es','hay','la','las','lo','los','me','muéstrame','muestrame','para','por','que','qué','quiero','son','todos','todas','un','una','ver']);
const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE').replace(/\s+/g,' ').trim();
const exactKey=(value:unknown)=>normalize(value).replace(/^kardex\s*/,'').replace(/^k(?=\d)/,'').replace(/^0+(?=\d)/,'');
const distinct=(values:Array<string|number|undefined>)=>[...new Set(values.map(value=>String(value??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const plural=(count:number,singular:string,pluralForm=`${singular}s`)=>`${count} ${count===1?singular:pluralForm}`;
const metadata=(document:DocumentRecord)=>normalize([document.fileName,document.tipo,document.kardex,document.normalizedKardex,document.numeroMinuta,document.escritura,document.actoJuridico,document.tomo,document.ano,document.bienio,document.fecha,document.observaciones,...document.contratantes].join(' '));

function relationMissing(documents:DocumentRecord[],missing:'registro'|'origen'){
 const groups=new Map<string,DocumentRecord[]>();
 for(const document of documents){const kardex=exactKey(document.normalizedKardex??document.kardex);if(!kardex)continue;const key=[kardex,document.ano??document.bienio??'',document.tomo].join('|');groups.set(key,[...(groups.get(key)??[]),document])}
 return [...groups.values()].filter(rows=>{const types=rows.map(document=>normalize(document.tipo));const hasOrigin=types.some(type=>type.includes('minuta')||type==='solicitud');const hasRegistry=types.some(type=>!type.includes('minuta')&&type!=='solicitud');return missing==='registro'?hasOrigin&&!hasRegistry:hasRegistry&&!hasOrigin}).flat();
}

function missingAnswer(label:string,results:DocumentRecord[]){const kardexes=distinct(results.map(document=>document.normalizedKardex??document.kardex));return {answer:kardexes.length?`${plural(kardexes.length,'kardex','kardex')} ${label}: ${kardexes.join(', ')}.`:`No encontré kardex ${label}.`,results,recognized:true} satisfies DocumentAssistantAnswer}

function controlScope(question:string,documents:DocumentRecord[]){
 const q=normalize(question);let rows=[...documents];
 const biennium=q.match(/\b(\d{4})\s*[-–]\s*(\d{4})\b/)?.[0]?.replace(/\s/g,'');
 const year=q.match(/(?:año|ano)\s+(\d{4})\b/)?.[1]??(!biennium?q.match(/\b(?:19|20)\d{2}\b/)?.[0]:undefined);
 const tome=q.match(/\btomo\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardexCandidate=q.match(/\bkardex\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];const kardex=kardexCandidate&&/\d/.test(kardexCandidate)&&!['de','del','en'].includes(kardexCandidate)?kardexCandidate:undefined;
 if(biennium)rows=rows.filter(document=>normalize(document.bienio)===biennium);
 else if(year)rows=rows.filter(document=>String(document.ano??'')===year||normalize(document.bienio).split('-').includes(year));
 if(tome)rows=rows.filter(document=>exactKey(document.tomo)===exactKey(tome));
 if(kardex)rows=rows.filter(document=>exactKey(document.normalizedKardex??document.kardex)===exactKey(kardex));
 return {rows,year,biennium,tome,kardex};
}

function filters(question:string,documents:DocumentRecord[]){
 const q=normalize(question);let rows=[...documents];let recognized=false;
 const biennium=q.match(/\b(\d{4})\s*[-–]\s*(\d{4})\b/)?.[0]?.replace(/\s/g,'');
 const year=q.match(/(?:año|ano)\s+(\d{4})\b/)?.[1]??(!biennium?q.match(/\b(?:19|20)\d{2}\b/)?.[0]:undefined);
 const tome=q.match(/\btomo\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];
 const kardexCandidate=q.match(/\bkardex\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];const kardex=kardexCandidate&&/\d/.test(kardexCandidate)&&!['de','del','en'].includes(kardexCandidate)?kardexCandidate:undefined;
 const escrituraCandidate=q.match(/\bescritura\s+(?:n(?:umero|ro)?\.?\s*)?([a-z0-9-]+)/)?.[1];const escritura=['de','del','en'].includes(escrituraCandidate??'')?undefined:escrituraCandidate;
 const minuteNumber=q.match(/\bminuta\s+(?:n(?:umero|ro)?\.?\s*)?(\d+)/)?.[1];
 if(biennium){recognized=true;rows=rows.filter(document=>normalize(document.bienio)===biennium)}
 else if(year){recognized=true;rows=rows.filter(document=>String(document.ano??'')===year||normalize(document.bienio).split('-').includes(year))}
 if(tome){recognized=true;rows=rows.filter(document=>exactKey(document.tomo)===exactKey(tome))}
 if(kardex){recognized=true;rows=rows.filter(document=>exactKey(document.normalizedKardex??document.kardex)===exactKey(kardex))}
 if(escritura){recognized=true;rows=rows.filter(document=>exactKey(document.escritura)===exactKey(escritura))}
 if(q.includes('minuta')){recognized=true;rows=rows.filter(document=>normalize(document.tipo).includes('minuta')||(minuteNumber?exactKey(document.numeroMinuta)===exactKey(minuteNumber):false))}
 const knownTypes=['solicitud','testamento','compraventa','compra-venta','poder','sucesion intestada','escritura publica'];const type=knownTypes.find(value=>q.includes(value));
 if(type){recognized=true;const expected=type==='compra-venta'?'compraventa':type;rows=rows.filter(document=>metadata(document).includes(expected))}
 const structural=new Set(['archivo','archivos','cantidad','cuantos','cuantas','documento','documentos','escritura','escrituras','kardex','minuta','minutas','tomo','tomos','bienio','tipo']);
 const tokens=q.split(/[^a-z0-9ñáéíóú-]+/).filter(token=>token.length>2&&!stop.has(token)&&!structural.has(token)&&token!==year&&!biennium?.includes(token)&&token!==tome&&token!==kardex&&token!==escritura&&token!==minuteNumber);
 if(tokens.length&&!recognized){rows=rows.filter(document=>tokens.every(token=>metadata(document).includes(token)))}
 return {q,rows,recognized:recognized||tokens.length>0,year,biennium,tome,kardex};
}

export function answerDocumentQuestion(question:string,documents:DocumentRecord[],scopedId?:number):DocumentAssistantAnswer{
 if(/\b(como|ayuda|pasos|explica)\b/.test(normalize(question))){
  const q=normalize(question);
  const answer=/subir|cargar|digitaliz/.test(q)?'Para registrar un PDF, abre Digitalización, selecciona la clase documental y el archivo, revisa el OCR y los datos detectados, y confirma el guardado. Si el archivo ya existe, revisa el documento registrado antes de volver a cargarlo.':/buscar|encontrar|localizar/.test(q)?'Puedes buscar en Gestión Documental por nombre, kardex, contratante, tomo o periodo. Aquí también puedes preguntar por esos datos o por palabras que aparezcan en el texto OCR.':/eliminar|borrar/.test(q)?'En Gestión Documental, abre las acciones del archivo y elige Eliminar. Selecciona el motivo; Documento duplicado y Documento incorrecto eliminan también el PDF para permitir una nueva carga.':'Puedo ayudarte a buscar documentos registrados, revisar datos de un kardex y explicar los pasos de digitalización, búsqueda o eliminación. Indica el dato o la tarea concreta.';
  return {answer,results:[],recognized:true};
 }
 if(scopedId){const results=documents.filter(document=>document.id===scopedId);return {answer:results.length?'Encontré el documento seleccionado. Puedes consultarlo mediante sus datos registrados y el texto OCR disponible.':'No encontré el documento seleccionado.',results,recognized:true}}
 const normalizedQuestion=normalize(question);
 const scoped=controlScope(question,documents);const scopeLabel=scoped.year?` en el año ${scoped.year}`:scoped.biennium?` en el bienio ${scoped.biennium}`:'';
 if(normalizedQuestion.includes('qr')&&/(?:sin|no (?:tiene|tienen)|falta|faltan)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.qrUrl&&!document.qrRawValue);return {answer:`Encontré ${plural(results.length,'documento')} sin QR detectado${scopeLabel}.`,results,recognized:true}}
 if(/(?:falta|faltan|sin).*(?:acta|escritura|registro notarial)/.test(normalizedQuestion))return missingAnswer(`sin acta o Registro Notarial relacionado${scopeLabel}`,relationMissing(scoped.rows,'registro'));
 if(/(?:falta|faltan|sin).*minuta/.test(normalizedQuestion))return missingAnswer(`sin Minuta o Solicitud relacionada${scopeLabel}`,relationMissing(scoped.rows,'origen'));
 if(/(?:ocr|lectura).*(?:pendiente|falta|faltan|sin)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>{const status=normalize(document.ocr);return !status||status.includes('pendiente')||status.includes('no proces')});return {answer:`Encontré ${plural(results.length,'documento')} con OCR pendiente o sin procesar${scopeLabel}.`,results,recognized:true}}
 if(/(?:ocr|lectura).*(?:error|fall)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>/error|fall/.test(normalize(document.ocr)));return {answer:`Encontré ${plural(results.length,'documento')} con error de OCR${scopeLabel}.`,results,recognized:true}}
 if(/(?:sin|falta|faltan).*(?:acto juridico|acto)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.actoJuridico.trim());return {answer:`Encontré ${plural(results.length,'documento')} sin acto jurídico registrado${scopeLabel}.`,results,recognized:true}}
 if(/(?:sin|falta|faltan).*(?:contratante|solicitante)/.test(normalizedQuestion)){const results=scoped.rows.filter(document=>!document.contratantes.length);return {answer:`Encontré ${plural(results.length,'documento')} sin contratante o solicitante registrado${scopeLabel}.`,results,recognized:true}}
 const query=filters(question,documents);const {q,rows}=query;
 if(/cuant[oa]s?/.test(q)&&/\btomos?\b/.test(q)){const tomes=distinct(rows.map(document=>document.tomo));const scope=query.year?` en el año ${query.year}`:query.biennium?` en el bienio ${query.biennium}`:'';return {answer:`Hay ${plural(tomes.length,'tomo')}${scope}${tomes.length?`: ${tomes.join(', ')}.`:'.'}`,results:rows,recognized:true}}
 if(/(?:dame|lista|listar|muestra|cuales|cuáles)/.test(q)&&/\bkardex\b/.test(q)){const kardexes=distinct(rows.map(document=>document.normalizedKardex??document.kardex));const scope=query.tome?` del tomo ${query.tome}`:'';return {answer:kardexes.length?`Encontré ${plural(kardexes.length,'kardex','kardex')}${scope}: ${kardexes.join(', ')}.`:`No encontré kardex${scope}.`,results:rows,recognized:true}}
 if(/(?:dame|lista|listar|muestra|cuales|cuáles)/.test(q)&&/\btomos?\b/.test(q)){const tomes=distinct(rows.map(document=>document.tomo));return {answer:tomes.length?`Tomos encontrados: ${tomes.join(', ')}.`:'No encontré tomos con esos criterios.',results:rows,recognized:true}}
 if(/cuant[oa]s?/.test(q)){return {answer:`Encontré ${plural(rows.length,'documento')}${query.year?` en el año ${query.year}`:''}${query.tome?` en el tomo ${query.tome}`:''}.`,results:rows,recognized:true}}
 if(!rows.length)return {answer:'No encontré documentos registrados que coincidan con la consulta. Buscaré también en el texto OCR de los PDF.',results:[],recognized:query.recognized};
 if(q.includes('minuta')&&query.kardex){return {answer:`Encontré ${plural(rows.length,'minuta')} del kardex ${query.kardex}.`,results:rows,recognized:true}}
 return {answer:`Encontré ${plural(rows.length,'documento')} coincidentes dentro de Bóveda. Los resultados mostrados son las fuentes utilizadas.`,results:rows,recognized:query.recognized};
}
