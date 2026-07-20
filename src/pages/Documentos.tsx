import {useMemo,useState} from 'react';
import {Bot,Eye,Info,Search} from 'lucide-react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import type {DocumentRecord} from '../data/repository';
import {useDocuments} from '../hooks/useDocuments';
import './documents.css';

const searchable=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-PE');
const period=(document:DocumentRecord)=>String(document.ano??document.bienio??'—');
const folios=(document:DocumentRecord)=>document.fojaInicial||document.fojaFinal?`${document.fojaInicial??'—'} – ${document.fojaFinal??'—'}`:'—';
const instrument=(document:DocumentRecord)=>[document.tipo,document.escritura].filter(Boolean).join(' · ')||'—';

export function Documentos(){
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const {documents,loading}=useDocuments(false);
  const [query,setQuery]=useState(params.get('q')??'');
  const [page,setPage]=useState(1);
  const pageSize=10;
  const registered=useMemo(()=>documents.filter(document=>document.documentMode==='actual').sort((left,right)=>new Date(right.fechaRegistro).getTime()-new Date(left.fechaRegistro).getTime()),[documents]);
  const filtered=useMemo(()=>{const needle=searchable(query.trim());if(!needle)return registered;return registered.filter(document=>searchable([document.fileName,document.kardex,...document.contratantes,document.numeroMinuta,document.tipo,document.escritura,document.tomo,document.ano,document.bienio].join(' ')).includes(needle))},[query,registered]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,totalPages);
  const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  function showData(document:DocumentRecord){window.alert([`Archivo: ${document.fileName}`,`Clase documental: ${document.tipo||'—'}`,`Kardex: ${document.kardex||'—'}`,`Contratante principal: ${document.contratantes[0]||'—'}`,`Acto jurídico: ${document.actoJuridico||'—'}`,`Instrumento: ${instrument(document)}`,`Tomo: ${document.tomo||'—'}`,`Foja: ${folios(document)}`,`Año o bienio: ${period(document)}`,`Fecha de registro: ${new Date(document.fechaRegistro).toLocaleString('es-PE')}`].join('\n'))}
  return <div className="page-content docsPage">
    <section className="card documentsControls simpleDocumentsControls"><div className="docSearch"><Search size={15}/><input value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder="Buscar por archivo, kardex, contratante, minuta, instrumento, tomo o periodo..."/></div><button className="btn documentsAiButton" onClick={()=>navigate('/asistente?scope=documents')}><Bot size={14}/>Consultar con IA</button></section>
    <section className="card tableCard documentsTableCard">
      {loading?<div className="documentsLoading">Leyendo documentos registrados…</div>:registered.length===0?<div className="documentsEmpty compactDocumentsEmpty"><p>No hay documentos registrados todavía.</p><button className="btn" onClick={()=>navigate('/digitalizacion')}>Ir al Centro de Digitalización</button></div>:shown.length===0?<div className="documentsEmpty compactDocumentsEmpty"><p>No se encontraron documentos con esa búsqueda.</p></div>:<><div className="tableViewport"><table className="documentsTable"><thead><tr>{['Nombre del PDF','Clase documental','Kardex','Contratante principal','Acto jurídico','Instrumento','Tomo','Foja','Año o bienio','Fecha de registro','Acción'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{shown.map(document=><tr key={document.id}><td className="documentFileName" title={document.fileName}>{document.fileName}</td><td>{document.tipo||'—'}</td><td>{document.kardex||'—'}</td><td className="principalContractor" title={document.contratantes.join('; ')}>{document.contratantes[0]||'—'}</td><td>{document.actoJuridico||'—'}</td><td>{instrument(document)}</td><td>{document.tomo||'—'}</td><td>{folios(document)}</td><td>{period(document)}</td><td>{new Date(document.fechaRegistro).toLocaleString('es-PE')}</td><td><div className="documentPrimaryActions"><button className="btn" onClick={()=>navigate('/visor/'+document.id)}><Eye/>Ver PDF</button><button className="btn" onClick={()=>showData(document)}><Info/>Ver datos</button></div></td></tr>)}</tbody></table></div>{totalPages>1&&<footer className="documentsPagination"><span>Página {currentPage} de {totalPages} · {filtered.length} registros</span><div><button disabled={currentPage<=1} onClick={()=>setPage(value=>value-1)}>‹</button>{Array.from({length:totalPages},(_,index)=><button className={currentPage===index+1?'current':''} onClick={()=>setPage(index+1)} key={index}>{index+1}</button>)}<button disabled={currentPage>=totalPages} onClick={()=>setPage(value=>value+1)}>›</button></div></footer>}</>}
    </section>
  </div>;
}
