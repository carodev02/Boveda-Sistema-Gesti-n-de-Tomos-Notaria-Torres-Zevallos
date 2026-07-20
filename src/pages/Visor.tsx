import {useEffect,useState} from 'react';
import {ChevronLeft,Download,Minus,Plus,Printer,RotateCw} from 'lucide-react';
import {useLocation,useNavigate,useParams} from 'react-router-dom';
import {StatusBadge} from '../components/StatusBadge';
import {documentUrl,getDocument,type DocumentRecord} from '../data/repository';
import {documentFolioDisplay} from '../services/documentFolio';
import {sanitizeDisplayText} from '../utils/displayText';
import './viewer.css';

const display=(value:unknown)=>sanitizeDisplayText(value)||'—';
const relatedLabel=(item:NonNullable<DocumentRecord['relatedDocuments']>[number])=>/minuta/i.test(item.tipo)&&item.minuteNumber?`Minuta ${item.minuteNumber}`:item.instrumentNumber?`Escritura ${item.instrumentNumber}`:item.tipo;
export function Visor(){
 const {id}=useParams();const baseNavigate=useNavigate();const location=useLocation();const [document,setDocument]=useState<DocumentRecord>();const [url,setUrl]=useState('');const [zoom,setZoom]=useState(100);const [rotation,setRotation]=useState(0);
 const navigate=(target:string)=>baseNavigate(target==='/documentos'&&location.state?.from==='/tomos'?'/tomos':target);
 useEffect(()=>{let active=true;let objectUrl='';void getDocument(Number(id)).then(record=>{if(!active||!record)return;objectUrl=documentUrl(record);setDocument(record);setUrl(objectUrl)});return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[id]);
 if(!document)return <div className="viewerPage viewerEmpty"><button className="btn" onClick={()=>navigate('/documentos')}><ChevronLeft/>Volver</button><p>Abriendo documento…</p></div>;
 const current=document;const {range,exact}=documentFolioDisplay(current);const biennium=current.bienniumStart&&current.bienniumEnd?`${current.bienniumStart}-${current.bienniumEnd}`:undefined;
 function download(){const fileUrl=documentUrl(current);const link=window.document.createElement('a');link.href=fileUrl;link.download=current.fileName;link.click();URL.revokeObjectURL(fileUrl)}
 function print(){const tab=window.open(url,'_blank');tab?.addEventListener('load',()=>tab.print())}
 return <div className="viewerPage"><div className="viewerToolbar"><button className="btn" onClick={()=>navigate('/documentos')}><ChevronLeft/>Volver</button><div><b>{display(document.fileName)}</b><span>Documento actual</span></div><div className="viewerTools"><button onClick={()=>setZoom(v=>Math.max(60,v-10))}><Minus/></button><span>{zoom}%</span><button onClick={()=>setZoom(v=>Math.min(160,v+10))}><Plus/></button><button onClick={()=>setRotation(v=>(v+90)%360)}><RotateCw/></button><button onClick={print}><Printer/></button><button className="download" onClick={download}><Download/>Descargar original</button></div></div><div className="viewerBody realViewerBody"><main className="canvas realCanvas">{url&&<iframe title={`PDF ${document.fileName}`} src={url} style={{width:`${zoom}%`,transform:`rotate(${rotation}deg)`}}/>}</main><aside className="metadata"><h3>Información documental</h3><StatusBadge>{display(document.documento)}</StatusBadge><dl>
 <dt>Número de escritura</dt><dd>{display(document.escritura)}</dd><dt>Número de minuta</dt><dd>{display(document.numeroMinuta)}</dd><dt>Acto jurídico</dt><dd>{display(document.actoJuridico)}</dd><dt>Kardex relacionado</dt><dd>{display(document.normalizedKardex??document.kardex)}</dd><dt>Tipo documental</dt><dd>{display(document.tipo)}</dd><dt>{biennium?'Bienio':'Año'}</dt><dd>{biennium??display(document.ano)}</dd><dt>Tomo</dt><dd>{display(document.tomo)}</dd><dt>Rango de fojas del tomo</dt><dd>{range}</dd><dt>Foja exacta</dt><dd>{exact}</dd><dt>Contratantes</dt><dd>{document.contratantes.length?document.contratantes.map(display).join('; '):'—'}</dd><dt>Observaciones</dt><dd>{display(document.observaciones)}</dd><dt>Estado OCR</dt><dd>{display(document.ocr)}</dd></dl>
 <h3>Documentos del mismo Kardex</h3>{document.relatedDocuments?.length?<><p>{document.relationStatus}</p><div className="documentPrimaryActions">{document.relatedDocuments.map(item=><button className="btn" key={item.id} onClick={()=>baseNavigate(`/visor/${item.id}`,{state:location.state})}>{relatedLabel(item)} — {item.fileName}</button>)}</div></>:<p>No hay otro documento relacionado todavía.</p>}
 </aside></div></div>;
}
