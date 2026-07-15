import {useMemo,useState} from 'react';
import {Bot,Download,Eye,FilePlus2,History,MoreHorizontal,Pencil,Search,Trash2} from 'lucide-react';
import {useNavigate,useSearchParams} from 'react-router-dom';
import {StatusBadge} from '../components/StatusBadge';
import {deleteDocument,documentUrl,updateDocument,type DocumentRecord} from '../data/repository';
import {useDocuments} from '../hooks/useDocuments';
import './documents.css';

export function Documentos(){
  const navigate=useNavigate();
  const [params]=useSearchParams();
  const [showDeleted]=useState(params.get('eliminados')==='1');
  const {documents,loading,refresh}=useDocuments(showDeleted);
  const [advanced,setAdvanced]=useState(false);
  const [query,setQuery]=useState(params.get('q')??'');
  const [type,setType]=useState(params.get('tipo')??'');
  const [mode,setMode]=useState('');
  const [period,setPeriod]=useState('');
  const [tomo,setTomo]=useState('');
  const [documentStatus,setDocumentStatus]=useState('');
  const [ocrStatus,setOcrStatus]=useState(params.get('ocr')??'');
  const [page,setPage]=useState(1);
  const pageSize=7;

  const filtered=useMemo(()=>documents.filter(doc=>{
    const text=[doc.escritura,doc.kardex,doc.numeroMinuta,doc.actoJuridico,doc.observaciones,...doc.contratantes].join(' ').toLowerCase();
    return text.includes(query.toLowerCase())&&(!type||doc.tipo===type)&&(!mode||doc.documentMode===mode)&&(!period||String(doc.ano??doc.bienio)===period)&&(!tomo||doc.tomo===tomo)&&(!documentStatus||doc.documento===documentStatus)&&(!ocrStatus||doc.ocr===ocrStatus);
  }),[documents,query,type,mode,period,tomo,documentStatus,ocrStatus]);

  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const currentPage=Math.min(page,pages);
  const shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const hasFilters=Boolean(query||type||mode||period||tomo||documentStatus||ocrStatus);

  async function edit(doc:DocumentRecord){
    const actoJuridico=window.prompt('Acto jurídico',doc.actoJuridico); if(actoJuridico===null)return;
    const contractors=window.prompt('Contratantes separados por punto y coma',doc.contratantes.join('; ')); if(contractors===null)return;
    const observaciones=window.prompt('Observaciones',doc.observaciones); if(observaciones===null)return;
    await updateDocument({...doc,actoJuridico,contratantes:contractors.split(';').map(value=>value.trim()).filter(Boolean),observaciones});
    await refresh();
  }
  async function remove(doc:DocumentRecord){if(!window.confirm(`¿Eliminar ${doc.fileName}? El archivo almacenado también será eliminado.`))return;await deleteDocument(doc.id);await refresh()}
  function download(doc:DocumentRecord){const url=documentUrl(doc);const link=document.createElement('a');link.href=url;link.download=doc.fileName;link.click();URL.revokeObjectURL(url)}
  function clear(){setQuery('');setType('');setMode('');setPeriod('');setTomo('');setDocumentStatus('');setOcrStatus('');setPage(1)}

  return <div className="page-content docsPage">
    <section className="card documentsControls">
      <div className="documentsControlsHeader"><div className="tabs documentsTabs">
        <button className={!advanced?'active':''} onClick={()=>setAdvanced(false)}>Lista de documentos</button>
        <button className={advanced?'active':''} onClick={()=>setAdvanced(true)}>Búsqueda avanzada</button>
      </div><button className="btn documentsAiButton" onClick={()=>navigate('/asistente')}><Bot size={14}/>Consultar con IA</button></div>
      <div className="docFilters">
        <div className="docSearch"><Search size={15}/><input value={query} onChange={event=>{setQuery(event.target.value);setPage(1)}} placeholder="Buscar escritura, kardex, minuta o contratante..."/></div>
        <select className="field" value={type} onChange={event=>{setType(event.target.value);setPage(1)}}><option value="">Tipo documental</option>{[...new Set(documents.map(doc=>doc.tipo))].map(value=><option key={value}>{value}</option>)}</select>
        <select className="field" value={documentStatus} onChange={event=>{setDocumentStatus(event.target.value);setPage(1)}}><option value="">Estado documental</option>{[...new Set(documents.map(doc=>doc.documento))].map(value=><option key={value}>{value}</option>)}</select>
        <select className="field" value={ocrStatus} onChange={event=>{setOcrStatus(event.target.value);setPage(1)}}><option value="">Estado OCR</option>{[...new Set(documents.map(doc=>doc.ocr))].map(value=><option key={value}>{value}</option>)}</select>
        <button className="btn manualRegister" onClick={()=>navigate('/digitalizacion')}><FilePlus2 size={15}/>Registrar manualmente</button>
      </div>
      {advanced&&<div className="advancedFilters">
        <label>CLASIFICACIÓN<select className="field" value={mode} onChange={event=>setMode(event.target.value)}><option value="">Todos los procesos</option><option value="actual">Digitalización asistida</option><option value="historico">Importación de archivo existente</option></select></label>
        <label>AÑO O BIENIO<select className="field" value={period} onChange={event=>setPeriod(event.target.value)}><option value="">Todos</option>{[...new Set(documents.map(doc=>String(doc.ano??doc.bienio)))].filter(value=>value!=='undefined').map(value=><option key={value}>{value}</option>)}</select></label>
        <label>TOMO<select className="field" value={tomo} onChange={event=>setTomo(event.target.value)}><option value="">Todos</option>{[...new Set(documents.map(doc=>doc.tomo))].map(value=><option key={value}>{value}</option>)}</select></label>
        <button className="btn" disabled={!hasFilters} onClick={clear}>Limpiar filtros</button>
      </div>}
      <div className="resultsSummary"><span><b>{filtered.length}</b> documento{filtered.length===1?'':'s'} encontrado{filtered.length===1?'':'s'}</span><span>{filtered.filter(doc=>doc.documento==='Pendiente'||doc.documento==='En revisión').length} por revisar</span><span>{filtered.filter(doc=>doc.ocr==='Procesado').length} con OCR procesado</span></div>
    </section>

    <section className="card tableCard documentsTableCard">
      {loading?<div className="documentsLoading">Leyendo archivos almacenados…</div>:shown.length===0?<div className="documentsEmpty"><div className="emptyIcon"><Search size={24}/></div><h2>No se encontraron documentos</h2><p>Prueba modificando los filtros o registra un documento.</p><div><button className="btn" disabled={!hasFilters} onClick={clear}>Limpiar filtros</button><button className="btn primary" onClick={()=>navigate('/digitalizacion')}>Ir al Centro de Digitalización</button></div></div>:<>
        <div className="tableViewport">
          <table className="documentsTable">
            <thead><tr>{['Escritura','Kardex','Minuta','Contratante principal','Tipo documental','Acto jurídico','Año o bienio','Tomo','Fojas','Estado documental','Estado OCR','Acciones'].map(value=><th key={value}>{value}</th>)}</tr></thead>
            <tbody>{shown.map(doc=><tr key={doc.id}>
              <td className="writing">{doc.escritura||'—'}</td>
              <td title={doc.kardex}>{doc.kardex||'—'}</td>
              <td>{doc.numeroMinuta||'—'}</td>
              <td className="principalContractor" title={doc.contratantes.join('; ')}>{doc.contratantes[0]||'—'}{doc.contratantes.length>1&&<small>+{doc.contratantes.length-1} adicional{doc.contratantes.length>2?'es':''}</small>}</td>
              <td>{doc.tipo||'—'}</td>
              <td title={doc.actoJuridico}>{doc.actoJuridico||'—'}</td>
              <td>{doc.ano??doc.bienio??'—'}</td>
              <td>{doc.tomo||'—'}</td>
              <td>{doc.fojaInicial||doc.fojaFinal?`${doc.fojaInicial??'—'} – ${doc.fojaFinal??'—'}`:'—'}</td>
              <td><StatusBadge>{doc.documento}</StatusBadge></td>
              <td><StatusBadge>{doc.ocr}</StatusBadge></td>
              <td><div className="rowActions">
                <button title="Ver documento" onClick={()=>navigate('/visor/'+doc.id)}><Eye/></button>
                <button title="Editar metadatos" onClick={()=>edit(doc)}><Pencil/></button>
                <button title="Descargar PDF" onClick={()=>download(doc)}><Download/></button>
                <button title="Ver historial" onClick={()=>navigate('/auditoria')}><History/></button>
                <button title="Eliminar documento" onClick={()=>remove(doc)}><Trash2/></button>
                <button title="Más información" onClick={()=>window.alert(`Archivo: ${doc.fileName}\nMinuta: ${doc.numeroMinuta||'—'}\nActo: ${doc.actoJuridico}\nContratantes: ${doc.contratantes.join('; ')}\nObservaciones: ${doc.observaciones||'—'}`)}><MoreHorizontal/></button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <footer className="documentsPagination"><span>Página {currentPage} de {pages} · {filtered.length} registros</span><div><button disabled={currentPage<=1} onClick={()=>setPage(value=>value-1)}>‹</button>{Array.from({length:pages},(_,index)=><button className={currentPage===index+1?'current':''} onClick={()=>setPage(index+1)} key={index}>{index+1}</button>)}<button disabled={currentPage>=pages} onClick={()=>setPage(value=>value+1)}>›</button></div></footer>
      </>}
    </section>
  </div>;
}


