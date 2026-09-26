import {AlertTriangle,CalendarDays,FileText,ScanLine} from 'lucide-react';
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useDocuments} from '../hooks/useDocuments';
import {useAuth} from '../auth/AuthContext';
import {auditApi,type CentralAuditRecord} from '../services/auditApi';
import {listAttentionJobs,type AttentionJob} from '../services/documentsApi';
import {dashboardDocumentTypeCounts,dashboardTypeKey,hasProcessingError,lacksOcrProcessing,needsDocumentReview,wasRegisteredToday} from '../utils/dashboardMetrics';
import './dashboard.css';

export function Dashboard(){
 const navigate=useNavigate();
 const {user}=useAuth();
 const {documents,loading}=useDocuments();
 const [activity,setActivity]=useState<CentralAuditRecord[]>([]);
 const [activityLoading,setActivityLoading]=useState(true);
 const [jobs,setJobs]=useState<AttentionJob[]>([]);
 useEffect(()=>{let active=true;auditApi.recent().then(rows=>{if(active)setActivity(rows)}).catch(()=>{if(active)setActivity([])}).finally(()=>{if(active)setActivityLoading(false)});return()=>{active=false}},[]);
 useEffect(()=>{let active=true;listAttentionJobs().then(rows=>{if(active)setJobs(rows)}).catch(()=>undefined);return()=>{active=false}},[]);
 const pending=documents.filter(needsDocumentReview).length+jobs.filter(job=>['UPLOADED','QUALITY_ANALYSIS','QUALITY_REVIEW','REVIEW_REQUIRED','READY_TO_SAVE'].includes(job.status)).length;
 const noOcr=documents.filter(lacksOcrProcessing).length+jobs.filter(job=>['OCR_PENDING','OCR_PROCESSING'].includes(job.status)).length;
 const errors=documents.filter(hasProcessingError).length+jobs.filter(job=>job.status==='FAILED').length;
 const periods=[...new Set(documents.map(doc=>String(doc.ano??doc.bienio??'Sin periodo')))];
 const typeCounts=dashboardDocumentTypeCounts(documents);
 const maxPeriod=Math.max(1,...periods.map(period=>documents.filter(doc=>String(doc.ano??doc.bienio??'Sin periodo')===period).length));
 return <div className="page-content dashboard">
  <h2 className="attentionTitle"><AlertTriangle size={16}/>Requieren atención</h2>
  <div className="attentionGrid realAttention"><Attention title="Pendientes de revisión" value={pending} onClick={()=>navigate('/documentos?attention=review')}/><Attention title="Sin procesamiento OCR" value={noOcr} onClick={()=>navigate('/documentos?attention=ocr-pending')}/><Attention title="Errores de procesamiento" value={errors} danger onClick={()=>navigate('/documentos?attention=ocr-error')}/></div>
  <div className="statsGrid realStats"><Stat icon={<FileText/>} value={String(documents.length)} label="Archivos reales registrados"/><Stat icon={<ScanLine/>} value={String(documents.filter(doc=>doc.documentMode==='historico').length)} label="Documentos históricos"/><Stat icon={<CalendarDays/>} value={String(documents.filter(doc=>wasRegisteredToday(doc.fechaRegistro)).length)} label="Registrados hoy"/></div>
  <div className="charts">
   <div className="card chartCard"><h3>Documentos registrados por periodo</h3><p className="muted">Años actuales y bienios históricos</p><div className="barChart">{periods.map(period=>{const count=documents.filter(doc=>String(doc.ano??doc.bienio??'Sin periodo')===period).length;return <div className="barCol" title={`${period}: ${count} documentos`} key={period}><div className="bar" style={{height:`${Math.max(8,count/maxPeriod*150)}px`}}/><span>{period}</span></div>})}{!loading&&periods.length===0&&<p className="emptyChart">Sin documentos cargados</p>}</div></div>
   <div className="card chartCard donutCard"><h3>Por tipo documental</h3><p className="muted">Distribución de archivos reales</p><ul className="realTypeList">{typeCounts.map(([type,count])=><li key={dashboardTypeKey(type)}><i style={{background:'var(--gold)'}}/>{type}<b>{count}</b></li>)}{!loading&&typeCounts.length===0&&<li>Sin datos disponibles</li>}</ul></div>
  </div>
  <div className="card recent"><h3>Actividad del sistema</h3>{user&&['Administrador','Notario'].includes(user.role)&&<button className="btn" onClick={()=>navigate('/auditoria')}>Ver auditoría completa</button>}<div className="recentActivity">{activity.map(row=><div key={row.id}><i className={row.result==='Error'?'error':''}/><span><b>{row.action}</b><small>{row.userFullName} · {row.document}</small></span><time>{row.date} · {row.time}</time></div>)}{activityLoading&&<p>Cargando actividad reciente…</p>}{!activityLoading&&activity.length===0&&<p>No hay actividad reciente para mostrar.</p>}</div></div>
 </div>;
}

function Attention({title,value,danger,onClick}:{title:string,value:number,danger?:boolean,onClick:()=>void}){return <button className={'card attention '+(danger?'danger':'warning')} onClick={onClick}><span>!</span><div><b>{title}</b><small>{value} {value===1?'documento':'documentos'}</small><a>Revisar →</a></div></button>}
function Stat({icon,value,label}:{icon:React.ReactNode,value:string,label:string}){return <div className="card stat"><div className="icon-disc">{icon}</div><strong>{value}</strong><small>{label}</small></div>}
