import {useEffect,useRef,useState} from 'react';
import {Bell,CheckCircle2,Download,KeyRound,Trash2} from 'lucide-react';
import {clearNotifications,getNotifications,markNotificationsRead,NOTIFICATION_EVENT,type AppNotification} from '../services/notifications';

function icon(kind:AppNotification['kind']){return kind==='export'?<Download/>:kind==='password'?<KeyRound/>:kind==='delete'?<Trash2/>:<CheckCircle2/>}

export function NotificationBell(){
  const [open,setOpen]=useState(false);const [pinned,setPinned]=useState(false);const [items,setItems]=useState<AppNotification[]>(getNotifications);const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const sync=()=>setItems(getNotifications());const close=(event:MouseEvent)=>{if(root.current&&!root.current.contains(event.target as Node)){setPinned(false);setOpen(false)}};window.addEventListener(NOTIFICATION_EVENT,sync);document.addEventListener('mousedown',close);return()=>{window.removeEventListener(NOTIFICATION_EVENT,sync);document.removeEventListener('mousedown',close)}},[]);
  function show(){setOpen(true);setItems(markNotificationsRead())}
  function togglePinned(){if(pinned){setPinned(false);setOpen(false);return}setPinned(true);show()}
  return <div className={`notificationRoot ${pinned?'pinned':''}`} ref={root} onMouseEnter={show} onMouseLeave={()=>{if(!pinned)setOpen(false)}}><button className="notificationButton" title="Notificaciones" aria-label="Notificaciones" aria-expanded={open} aria-pressed={pinned} onClick={togglePinned}><Bell size={18}/>{items.some(item=>!item.read)&&<i/>}</button>{open&&<section className="notificationPopover"><header><div><b>Notificaciones</b><span>{items.length?`${items.length} recientes`:'Sin actividad reciente'}</span></div>{items.length>0&&<button type="button" onClick={()=>{clearNotifications();setItems([])}}>Limpiar</button>}</header><div className="notificationList">{items.length===0?<p>No hay notificaciones todavía.</p>:items.slice(0,8).map(item=><article key={item.id} className={`notificationItem ${item.kind}`}><span>{icon(item.kind)}</span><div><b>{item.title}</b><p>{item.detail}</p><small>{new Date(item.createdAt).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'numeric',minute:'2-digit'})}</small></div></article>)}</div></section>}</div>
}
