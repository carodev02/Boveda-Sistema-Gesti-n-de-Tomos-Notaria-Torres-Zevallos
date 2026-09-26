/* eslint-disable react-hooks/set-state-in-effect */
import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowRight,Bot,FileText,Search,Sparkles} from 'lucide-react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {addAudit,type DocumentRecord} from '../data/repository';
import {useDocuments} from '../hooks/useDocuments';
import {searchDocumentOcr} from '../services/assistantApi';
import {answerDocumentQuestion} from '../services/documentAssistant';
import {documentStatusLabel,ocrStatusLabel} from '../utils/statusLabels';
import './assistant.css';

type Exchange={question:string;answer:string;ids:number[]};

const suggestions=[
  'Dame los kardex del tomo 1',
  '¿Cuántos tomos hay en el año 2026?',
  'Minuta del kardex 111',
  'Dime cuáles no tienen QR',
  '¿Qué kardex están sin acta?',
  '¿Cuáles tienen el OCR pendiente?'
];

const stop=new Set(['busca','buscar','muestra','muestrame','documento','documentos','donde','del','los','las','que','qué','con','una','un','esta','este','sobre','tienen','tiene','aparezca','aparece','por','para','todos','firmados']);

function normalize(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function plural(count:number,singular:string,pluralForm=`${singular}s`){return `${count} ${count===1?singular:pluralForm}`}
function searchable(doc:DocumentRecord){return normalize([doc.escritura,doc.kardex,doc.numeroMinuta,doc.tipo,doc.actoJuridico,doc.ano,doc.bienio,doc.tomo,doc.documento,doc.ocr,doc.observaciones,...doc.contratantes].join(' '))}

function findDocuments(question:string,documents:DocumentRecord[],scoped?:number){
  const q=normalize(question);
  if(scoped)return documents.filter(doc=>doc.id===scoped);
  let result=[...documents];
  const period=q.match(/\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b/)?.[0]?.replace(/\s/g,'');
  const year=q.match(/\b(19|20)\d{2}\b/)?.[0];
  if(period)result=result.filter(doc=>normalize(String(doc.bienio??doc.ano??'')).includes(period));
  else if(year)result=result.filter(doc=>String(doc.ano??doc.bienio??'').includes(year));
  const tomo=q.match(/tomo\s+([\w-]+)/)?.[1];
  if(tomo)result=result.filter(doc=>normalize(doc.tomo).includes(tomo));
  const escritura=q.match(/escritura\s+(\d+)/)?.[1];
  if(escritura)result=result.filter(doc=>normalize(doc.escritura).includes(escritura));
  const kardex=q.match(/kardex\s+([\w-]+)/)?.[1];
  if(kardex)result=result.filter(doc=>normalize(doc.kardex).includes(kardex));
  if(q.includes('baja confianza'))result=result.filter(doc=>(doc.confianza??100)<80||normalize(doc.ocr).includes('baja'));
  if(q.includes('error'))result=result.filter(doc=>normalize(doc.ocr).includes('error'));
  const known=['compraventa','compra-venta','testamento','poder notarial','poderes','escritura publica','sucesion intestada'];
  const kind=known.find(value=>q.includes(normalize(value)));
  if(kind){const expected=kind==='poderes'?'poder':kind==='compra-venta'?'compraventa':kind;result=result.filter(doc=>searchable(doc).includes(normalize(expected)))}
  const tokens=q.split(/[^a-z0-9áéíóúñ-]+/).filter(token=>token.length>3&&!stop.has(token)&&!period?.includes(token)&&token!==year&&token!=='baja'&&token!=='confianza'&&token!=='errores'&&token!=='error'&&token!=='tomo'&&token!=='bienio'&&token!=='escritura');
  if(tokens.length)result=result.filter(doc=>tokens.some(token=>searchable(doc).includes(token)));
  return result.slice(0,12);
}

function answerFor(question:string,results:DocumentRecord[],total:number,scoped?:number){
  const q=normalize(question);
  if(q.includes('cuantos')&&q.includes('semana')){const limit=Date.now()-7*86400000;const count=results.filter(doc=>{const time=Date.parse(doc.fechaRegistro);return Number.isFinite(time)&&time>=limit}).length;return `Bóveda encontró ${plural(count,'documento','documentos')} registrados durante los últimos siete días, de ${plural(total,'registro','registros')} disponibles.`}
  if(!results.length)return 'No encontré documentos registrados que coincidan con la consulta. No se generó información fuera del repositorio de Bóveda.';
  if(scoped&&(q.includes('resum')||q.includes('extra')||q.includes('inconsisten')||q.includes('compar'))){const doc=results[0];if(q.includes('inconsisten'))return `Revisión del registro: ${doc.confianza!==undefined&&doc.confianza<80?'la confianza OCR requiere validación.':'no hay una alerta de baja confianza registrada.'} Escritura ${doc.escritura||'no detectada'}, kardex ${doc.kardex||'no detectado'}, ${plural(doc.contratantes.length,'contratante','contratantes')} y estado ${documentStatusLabel(doc.documento)}.`;if(q.includes('compar'))return `Comparación disponible con los metadatos registrados: escritura ${doc.escritura||'no detectada'}, kardex ${doc.kardex||'no detectado'}, minuta ${doc.numeroMinuta||'no detectada'} y acto jurídico ${doc.actoJuridico||'no detectado'}.`;return `Resumen basado en metadatos registrados: ${doc.tipo}, acto jurídico ${doc.actoJuridico||'no detectado'}, escritura ${doc.escritura||'no detectada'}, kardex ${doc.kardex||'no detectado'}, ${plural(doc.contratantes.length,'contratante','contratantes')}, ${plural(doc.cantidadPaginas,'página','páginas')} y estado de lectura ${ocrStatusLabel(doc.ocr)}.`}
  return `Encontré ${plural(results.length,'documento','documentos')} coincidentes dentro de Bóveda. Los resultados siguientes son los registros utilizados para esta respuesta.`;
}

type Chat={id:string;exchanges:Exchange[]};
function readChats(key:string):Chat[]{try{const rows=JSON.parse(localStorage.getItem(key)??'[]') as Chat[];return Array.isArray(rows)?rows.slice(0,12):[]}catch{return []}}

export function AsistenteIA(){
 const {user}=useAuth();const {documents,loading}=useDocuments();const navigate=useNavigate();const [params]=useSearchParams();
 const scopedId=Number(params.get('document'))||undefined;const action=params.get('action');
 const storageKey=`sigadn-assistant-chats-${user?.id??'guest'}`;
 const [chats,setChats]=useState<Chat[]>(()=>readChats(storageKey));
 const [activeId,setActiveId]=useState<string>(()=>localStorage.getItem(`${storageKey}-active`)??'');
 const [query,setQuery]=useState('');const [processing,setProcessing]=useState(false);
 const scope=useMemo(()=>documents.find(doc=>doc.id===scopedId),[documents,scopedId]);
 const active=chats.find(chat=>chat.id===activeId);
 useEffect(()=>{setChats(readChats(storageKey));setActiveId(localStorage.getItem(`${storageKey}-active`)??'')},[storageKey]);
 useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify(chats));localStorage.setItem(`${storageKey}-active`,activeId)},[chats,activeId,storageKey]);
 useEffect(()=>{if(!scope||!action)return;const prompts:Record<string,string>={summary:'Resume este documento',extract:'Extrae los datos importantes de este documento',inconsistencies:'Busca inconsistencias en este documento',compare:'Compara el OCR con los metadatos registrados',question:'Que información registrada tiene este documento?'};setQuery(prompts[action]??'')},[scope,action]);
 function newChat(){setActiveId('');setQuery('')}
 async function submit(text=query){
  const question=text.trim();if(!question||processing)return;setProcessing(true);
  try{
   let results:DocumentRecord[];let answer:string;
   if(scopedId){results=findDocuments(question,documents,scopedId);answer=answerFor(question,results,documents.length,scopedId)}
   else{const local=answerDocumentQuestion(question,documents);results=local.results;answer=local.answer;if(!results.length&&local.searchOcr){const ocr=await searchDocumentOcr(question).catch(()=>({answer:'No pude consultar el texto OCR en este momento. Inténtalo nuevamente o busca por nombre, kardex o escritura.',matches:[]}));if(ocr){const matched=new Set(ocr.matches.map(item=>item.documentId));results=documents.filter(document=>document.backendId&&matched.has(document.backendId));answer=ocr.answer}}}
   const exchange={question,answer,ids:results.slice(0,30).map(doc=>doc.id)};
   const id=activeId||crypto.randomUUID();
   setChats(current=>{const existing=current.find(chat=>chat.id===id);return [{id,exchanges:[...(existing?.exchanges??[]),exchange]},...current.filter(chat=>chat.id!==id)].slice(0,12)});
   setActiveId(id);setQuery('');
   await addAudit('CONSULTA IA','Asistente IA',scopedId?`Documento ${scopedId}`:question.slice(0,80)).catch(()=>undefined);
  }finally{setProcessing(false)}
 }
 const firstName=user?.fullName?.trim().split(/\s+/)[0]||'usuario';
 return <div className="page-content assistantPage"><div className="assistantLayout">
  <aside className="card assistantHistory"><div className="assistantBrand"><Bot/><div><b>Conversaciones</b><span>Consultas de {firstName}</span></div></div><button className="assistantNewChat" onClick={newChat}>+ Nuevo chat</button><h3>Historial reciente</h3>{chats.length===0&&<p className="historyEmpty">Todavía no hay consultas.</p>}{chats.map(chat=><button className={chat.id===activeId?'active':''} key={chat.id} onClick={()=>setActiveId(chat.id)}><Search/><span>{chat.exchanges[0]?.question??'Consulta'}</span></button>)}<div className="grounding"><FileText/><p><b>Datos de Bóveda</b>Respuestas basadas en registros y texto OCR disponibles.</p></div></aside>
  <main className="assistantMain">{scope&&<section className="card scopeCard"><FileText/><div><span>Consultando documento</span><b>Escritura {scope.escritura||'sin número'} ? Kardex {scope.kardex||'no detectado'}</b></div><button onClick={()=>navigate(`/visor/${scope.backendId??scope.id}`)}>Volver al documento</button></section>}
  <section className="card assistantConversation assistantSearchHome"><div className="assistantIntro"><div className="assistantOrb"><Sparkles/></div><h2>Hola, {firstName}</h2><p>Puedo ayudarte a encontrar documentos, consultar datos registrados y buscar en el texto de los PDF.</p></div>
  <form className="assistantComposer assistantSearchForm" onSubmit={event=>{event.preventDefault();void submit()}}><Sparkles/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={scope?'Pregunta sobre este documento':'Busca por nombre, kardex o contenido del PDF'}/><button disabled={!query.trim()||processing} aria-label="Buscar"><Search/><span>Buscar</span></button></form>
  <div className="assistantExampleLabel">EJEMPLOS DE BÚSQUEDA</div><div className="assistantSuggestions assistantExampleGrid">{suggestions.map(item=><button key={item} onClick={()=>void submit(item)}><Search/><span>{item}</span></button>)}</div>
  <div className="assistantChatExchanges">{active?.exchanges.map((exchange,index)=><article className="assistantExchange" key={`${active.id}-${index}`}><div className="userMessage">{exchange.question}</div><div className="assistantAnswer"><Bot/><div><p>{exchange.answer}</p>{exchange.ids.length>0&&<div className="assistantResults">{exchange.ids.map(id=>{const doc=documents.find(item=>item.id===id);return doc?<button key={id} onClick={()=>navigate(`/visor/${doc.backendId??id}`)}><FileText/><div><b>{doc.fileName}</b><span>Kardex {doc.kardex||'no detectado'} ? {doc.tipo}</span><small>{doc.bienio??doc.ano??'Sin periodo'} ? Tomo {doc.tomo||'no detectado'} ? {ocrStatusLabel(doc.ocr)}</small></div><ArrowRight/></button>:null})}</div>}<small className="sources">Fuente: {exchange.ids.length?`${exchange.ids.length} registros de Bóveda`:'sin fuentes coincidentes'}.</small></div></div></article>)}</div>
  {loading&&<div className="assistantState">Leyendo documentos...</div>}{processing&&<div className="assistantState"><span className="processingDot"/>Buscando...</div>}<div className="assistantWarning"><AlertCircle/>Las respuestas usan los datos disponibles en Bóveda. Verifica el PDF antes de tomar decisiones.</div></section></main></div></div>
}
