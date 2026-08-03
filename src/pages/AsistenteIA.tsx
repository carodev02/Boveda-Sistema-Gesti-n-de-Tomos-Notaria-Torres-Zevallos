/* eslint-disable react-hooks/set-state-in-effect */
import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowRight,Bot,FileText,Search,Sparkles} from 'lucide-react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {addAudit,type DocumentRecord} from '../data/repository';
import {useDocuments} from '../hooks/useDocuments';
import {documentStatusLabel,ocrStatusLabel} from '../utils/statusLabels';
import './assistant.css';

type Exchange={question:string;answer:string;ids:number[]};

const suggestions=[
  'Buscar Escritura 1500 del año 2022',
  'Buscar todos los poderes de Juan Pérez',
  'Buscar documentos de marzo del 2023',
  'Contratos firmados por María García en 2024',
  'Testamentos del primer trimestre de 2025',
  'Escrituras de compra-venta del año 2026'
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

export function AsistenteIA(){
  const {documents,loading}=useDocuments();
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const scopedId=Number(params.get('document'))||undefined;
  const action=params.get('action');
  const [query,setQuery]=useState('');
  const [processing,setProcessing]=useState(false);
  const [exchange,setExchange]=useState<Exchange>();
  const scope=useMemo(()=>documents.find(doc=>doc.id===scopedId),[documents,scopedId]);

  useEffect(()=>{if(!scope||!action)return;const prompts:Record<string,string>={summary:'Resume este documento',extract:'Extrae los datos importantes de este documento',inconsistencies:'Busca inconsistencias en este documento',compare:'Compara el OCR con los metadatos registrados',question:'¿Qué información registrada tiene este documento?'};setQuery(prompts[action]??'')},[scope,action]);

  async function submit(text=query){
    const question=text.trim();if(!question||processing)return;
    setProcessing(true);
    await new Promise(resolve=>window.setTimeout(resolve,350));
    const results=findDocuments(question,documents,scopedId);
    setExchange({question,answer:answerFor(question,results,documents.length,scopedId),ids:results.map(doc=>doc.id)});
    await addAudit('CONSULTA IA','Asistente IA',scopedId?`Documento ${scopedId}`:question.slice(0,80));
    setQuery('');setProcessing(false);
  }

  return <div className="page-content assistantPage"><div className="assistantLayout"><main className="assistantMain">{scope&&<section className="card scopeCard"><FileText/><div><span>Consultando documento</span><b>Escritura {scope.escritura||'sin número'} · Kardex {scope.kardex||'no detectado'}</b></div><button onClick={()=>navigate(`/visor/${scope.id}`)}>Volver al documento</button></section>}<section className="card assistantConversation assistantSearchHome"><div className="assistantIntro"><div className="assistantOrb"><Sparkles/></div><h2>Asistente IA</h2><p>Describe en lenguaje natural el documento que necesitas encontrar.<br/>La IA comprende contexto, fechas, nombres y tipos documentales.</p></div><form className="assistantComposer assistantSearchForm" onSubmit={event=>{event.preventDefault();void submit()}}><Sparkles/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={scope?'Haz una pregunta sobre este documento…':'¿Qué documento deseas encontrar?'}/><button disabled={!query.trim()||processing} aria-label="Buscar"><Search/><span>Buscar</span></button></form><div className="assistantExampleLabel">EJEMPLOS DE BÚSQUEDA</div><div className="assistantSuggestions assistantExampleGrid">{suggestions.map(item=><button key={item} onClick={()=>void submit(item)}><Search/><span>{item}</span></button>)}</div>{exchange&&<article className="assistantExchange"><div className="userMessage">{exchange.question}</div><div className="assistantAnswer"><Bot/><div><p>{exchange.answer}</p>{exchange.ids.length>0&&<div className="assistantResults">{exchange.ids.map(id=>{const doc=documents.find(item=>item.id===id);return doc?<button key={id} onClick={()=>navigate(`/visor/${id}`)}><FileText/><div><b>Escritura {doc.escritura||'sin número'}</b><span>Kardex {doc.kardex||'no detectado'} · {doc.tipo}</span><small>{doc.bienio??doc.ano??'Sin periodo'} · Tomo {doc.tomo||'no detectado'} · {ocrStatusLabel(doc.ocr)}</small></div><ArrowRight/></button>:null})}</div>}<small className="sources">Fuente: {exchange.ids.length?`${exchange.ids.length} ${exchange.ids.length===1?'registro':'registros'} de Bóveda`:'sin fuentes coincidentes'}.</small></div></div></article>}{loading&&<div className="assistantState">Leyendo el repositorio documental…</div>}{processing&&<div className="assistantState"><span className="processingDot"/>Analizando documentos registrados…</div>}<div className="assistantWarning"><AlertCircle/>El asistente no consulta internet ni inventa información. Verifica los documentos citados antes de tomar decisiones.</div></section></main></div></div>;
}

