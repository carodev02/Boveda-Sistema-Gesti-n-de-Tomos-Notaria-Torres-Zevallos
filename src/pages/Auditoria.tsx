import {useEffect,useMemo,useState} from 'react';
import {CalendarDays,Download} from 'lucide-react';
import {StatusBadge} from '../components/StatusBadge';
import {auditApi,type CentralAuditRecord} from '../services/auditApi';
import {csvCell,downloadText} from '../utils/client';
import './audit.css';

function auditDate(value:string){const [day,month,year]=value.split('/').map(Number);return new Date(year,month-1,day).getTime()}
type Period='today'|'yesterday'|'last7'|'last30'|'month'|'all'|'custom';

export function Auditoria(){
  const [records,setRecords]=useState<CentralAuditRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [timeline,setTimeline]=useState(false);
  const [period,setPeriod]=useState<Period>('today');
  const [dateFrom,setDateFrom]=useState('');
  const [dateTo,setDateTo]=useState('');
  const [user,setUser]=useState('');
  const [action,setAction]=useState('');
  const [result,setResult]=useState('');
  const [includeInactive,setIncludeInactive]=useState(false);

  useEffect(()=>{auditApi.list().then(setRecords).catch(cause=>setError(cause instanceof Error?cause.message:'No se pudo cargar la auditoría.')).finally(()=>setLoading(false))},[]);

  const userOptions=useMemo(()=>{const unique=new Map<string,CentralAuditRecord>();records.forEach(row=>{if(!unique.has(row.username))unique.set(row.username,row)});return [...unique.values()].filter(row=>row.username==='Sistema'||(!/^prueba[.@_-]/i.test(row.username)&&(includeInactive||(row.userStatus==='ACTIVO'&&!row.userDeletedAt)))).sort((a,b)=>a.userFullName.localeCompare(b.userFullName,'es'))},[records,includeInactive]);
  const actionOptions=useMemo(()=>{const unique=new Map<string,string>();records.forEach(row=>unique.set(row.actionCode,row.action));return [...unique.entries()].sort((a,b)=>a[1].localeCompare(b[1],'es'))},[records]);
  const rows=useMemo(()=>{const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());let from:number|undefined;let to:number|undefined;if(period==='today'){from=today.getTime();to=from+86400000-1}else if(period==='yesterday'){to=today.getTime()-1;from=to-86400000+1}else if(period==='last7'){from=today.getTime()-6*86400000;to=today.getTime()+86400000-1}else if(period==='last30'){from=today.getTime()-29*86400000;to=today.getTime()+86400000-1}else if(period==='month'){from=new Date(now.getFullYear(),now.getMonth(),1).getTime();to=today.getTime()+86400000-1}else if(period==='custom'){from=dateFrom?new Date(`${dateFrom}T00:00:00`).getTime():undefined;to=dateTo?new Date(`${dateTo}T23:59:59`).getTime():undefined}return records.filter(row=>{const time=auditDate(row.date);return (!user||row.username===user)&&(!action||row.actionCode===action)&&(!result||row.result===result)&&(from===undefined||time>=from)&&(to===undefined||time<=to)})},[records,user,action,result,period,dateFrom,dateTo]);
  const failed=rows.filter(row=>row.result==='Error').length;
  const lastUpdate=rows[0]?.time??'Sin registros';

  function userLabel(row:CentralAuditRecord){return row.username==='Sistema'?'Sistema':`${row.userFullName} — ${row.username}`}
  function exportRows(){const header=['Fecha','Hora','Usuario','Rol','Acción','Módulo','Detalle','Resultado'];const data=rows.map(row=>[row.date,row.time,userLabel(row),row.role,row.action,row.module,row.document,row.result]);downloadText('auditoria-sigadn.csv',[header,...data].map(row=>row.map(csvCell).join(',')).join('\n'),'text/csv;charset=utf-8')}
  function clearFilters(){setPeriod('today');setDateFrom('');setDateTo('');setUser('');setAction('');setResult('');setIncludeInactive(false)}

  return <div className="page-content auditPage"><div className="auditFilters"><div className="tabs"><button className={!timeline?'active':''} onClick={()=>setTimeline(false)}>Vista Tabla</button><button className={timeline?'active':''} onClick={()=>setTimeline(true)}>Línea de Tiempo</button></div><div className="auditPeriod"><CalendarDays/><select value={period} onChange={event=>{setPeriod(event.target.value as Period);setDateFrom('');setDateTo('')}} aria-label="Período"><option value="today">Hoy</option><option value="yesterday">Ayer</option><option value="last7">Últimos 7 días</option><option value="last30">Últimos 30 días</option><option value="month">Este mes</option><option value="all">Todo el historial</option><option value="custom">Rango personalizado</option></select></div>{period==='custom'&&<div className="auditDateRange" aria-label="Rango personalizado"><label>Desde<input type="date" value={dateFrom} onChange={event=>setDateFrom(event.target.value)}/></label><span>—</span><label>Hasta<input type="date" value={dateTo} min={dateFrom} onChange={event=>setDateTo(event.target.value)}/></label></div>}<select className="field auditUserFilter" value={user} onChange={event=>setUser(event.target.value)}><option value="">Todos los usuarios</option>{userOptions.map(option=><option value={option.username} key={option.username}>{userLabel(option)}</option>)}</select><select className="field" value={action} onChange={event=>setAction(event.target.value)}><option value="">Todas las acciones</option>{actionOptions.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select><select className="field" value={result} onChange={event=>setResult(event.target.value)}><option value="">Todos los resultados</option>{[...new Set(records.map(row=>row.result))].map(value=><option key={value}>{value}</option>)}</select><label className="auditInactiveToggle"><input type="checkbox" checked={includeInactive} onChange={event=>setIncludeInactive(event.target.checked)}/>Incluir usuarios inactivos</label><span/><button className="btn auditClear" onClick={clearFilters}>Limpiar filtros</button><button className="btn primary" disabled={rows.length===0} onClick={exportRows}><Download size={14}/>Exportar</button></div><div className="auditSummary"><strong>{rows.length} eventos encontrados</strong><i/> <span>{failed} intentos fallidos</span><i/><span>Última actualización: {lastUpdate}</span></div>{error&&<div className="card emptyState">{error}</div>}{timeline?<div className="card auditTimeline">{rows.map(row=><div key={row.id}><i/><span>{row.date} · {row.time}</span><b>{userLabel(row)} — {row.action}</b><small>{row.document} · {row.result}</small></div>)}{!loading&&rows.length===0&&<p>No se encontraron eventos registrados.</p>}</div>:<div className="card auditTable"><table><thead><tr>{['FECHA','HORA','USUARIO','ROL','ACCIÓN','MÓDULO','DETALLE','RESULTADO'].map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.date}</td><td>{row.time}</td><td className="user">{userLabel(row)}</td><td>{row.role}</td><td><span className="actionTag">{row.action}</span></td><td>{row.module}</td><td>{row.document}</td><td><StatusBadge>{row.result}</StatusBadge></td></tr>)}{!loading&&rows.length===0&&<tr><td colSpan={8} className="emptyState">No hay eventos registrados para los filtros seleccionados.</td></tr>}</tbody></table><footer>Los registros corresponden a la actividad centralizada de los usuarios autorizados del sistema.</footer></div>}</div>;
}
