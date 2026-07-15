import {useEffect,useRef,useState} from 'react';
import {BarChart3,Bell,BookOpen,Bot,CalendarDays,ChevronRight,FileText,KeyRound,LayoutDashboard,LogOut,Menu,MonitorSmartphone,Pencil,ScanLine,Search,Settings,Shield,UserRound,UsersRound,X} from 'lucide-react';
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {userInitials} from '../data/roles';
import {Brand} from './Brand';
import './layout.css';

const nav=[['/dashboard','Dashboard',LayoutDashboard],['/digitalizacion','Centro Digitalización',ScanLine],['/documentos','Gestión Documental',FileText],['/tomos','Gestión de Tomos',BookOpen],['/asistente','Asistente IA',Bot],['/usuarios','Usuarios',UsersRound],['/reportes','Reportes',BarChart3],['/auditoria','Auditoría',Shield]] as const;
const titles:Record<string,string>={dashboard:'Dashboard',digitalizacion:'Centro de Digitalización',documentos:'Gestión Documental',tomos:'Gestión de Tomos',asistente:'Asistente IA',usuarios:'Usuarios',reportes:'Reportes',auditoria:'Auditoría',visor:'Visor Documental',perfil:'Mi perfil',configuracion:'Configuración'};

export function AppLayout(){
  const navigate=useNavigate();
  const location=useLocation();
  const {user,logout}=useAuth();
  const key=location.pathname.split('/')[1]||'dashboard';
  const [search,setSearch]=useState('');
  const [profileOpen,setProfileOpen]=useState(false);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const menuRef=useRef<HTMLDivElement>(null);
  const [currentDate,setCurrentDate]=useState(()=>new Date());
  const canManageUsers=user?.role==='Notario'||user?.role==='Administrador';
  const canViewAudit=user?.role==='Notario'||user?.role==='Administrador';
  const visibleNav=nav.filter(([to])=>(to!=='/usuarios'||canManageUsers)&&(to!=='/auditoria'||canViewAudit));

  useEffect(()=>{
    function close(event:MouseEvent){if(menuRef.current&&!menuRef.current.contains(event.target as Node))setProfileOpen(false)}
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);

  useEffect(()=>{
    const interval=window.setInterval(()=>setCurrentDate(new Date()),60000);
    return()=>window.clearInterval(interval);
  },[]);

  useEffect(()=>{
    const notice=(location.state as {accessDenied?:string}|null)?.accessDenied;
    if(notice){window.alert(notice);navigate(location.pathname,{replace:true,state:null})}
  },[location.state,navigate,location.pathname]);

  async function logOut(){await logout();navigate('/login')}
  function submitSearch(event:React.FormEvent){event.preventDefault();if(search.trim())navigate(`/documentos?q=${encodeURIComponent(search.trim())}`)}
  function goProfile(query=''){setProfileOpen(false);navigate(`/perfil${query}`)}
  if(!user)return null;

  return <div className={`appShell ${mobileNavOpen?'mobileNavOpen':''}`}>
    {mobileNavOpen&&<button className="mobileNavBackdrop" aria-label="Cerrar menú" onClick={()=>setMobileNavOpen(false)}/>}<aside className="sidebar">
      <div className="sideBrand"><Brand/><ChevronRight size={17}/></div>
      <nav>
        {visibleNav.map(([to,label,Icon])=><NavLink key={to} to={to} onClick={()=>setMobileNavOpen(false)} className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{label}</span>{to==='/digitalizacion'&&<em>Principal</em>}</NavLink>)}
        {user.role==='Administrador'&&<NavLink to="/configuracion" onClick={()=>setMobileNavOpen(false)} className={({isActive})=>isActive?'active':''}><Settings size={19}/><span>Configuración</span></NavLink>}
      </nav>
      <div className="sideBottom">
        <label>ROL ACTIVO</label><div className="role">{user.role}</div>
        <div className="profileMenuRoot" ref={menuRef}>
          {profileOpen&&<div className="profileMenu" role="menu" aria-label="Menú del usuario"><button role="menuitem" onClick={()=>goProfile()}><UserRound/>Ver perfil</button><button role="menuitem" onClick={()=>goProfile('?edit=1')}><Pencil/>Editar perfil</button><button role="menuitem" onClick={()=>goProfile('?panel=password')}><KeyRound/>Cambiar contraseña</button><button role="menuitem" onClick={()=>goProfile('?panel=sessions')}><MonitorSmartphone/>Mis sesiones</button><div/><button className="dangerItem" role="menuitem" onClick={()=>void logOut()}><LogOut/>Cerrar sesión</button></div>}
          <button className="profile profileTrigger" type="button" aria-haspopup="menu" aria-expanded={profileOpen} onClick={()=>setProfileOpen(value=>!value)}><div className="avatar">{user.avatarUrl?<img src={user.avatarUrl} alt=""/>:userInitials(user.fullName)}</div><div className="profileIdentity" title={`${user.fullName} · ${user.email}`}><b>{user.fullName}</b><small>{user.role}</small></div><ChevronRight className={profileOpen?'profileChevron open':'profileChevron'} size={16}/></button>
        </div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><button className="mobileMenuButton" aria-label={mobileNavOpen?'Cerrar menú':'Abrir menú'} onClick={()=>setMobileNavOpen(value=>!value)}>{mobileNavOpen?<X size={20}/>:<Menu size={20}/>}</button><div><h1>{titles[key]}</h1><span>SIGADN · Notaría Torres Zevallos</span></div><div className="topActions"><form className="search" onSubmit={submitSearch}><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar archivos reales..."/><kbd>↵</kbd></form><button className="notificationButton" title="Estado del almacenamiento" onClick={()=>window.alert('Los PDF se consultan desde el almacenamiento del servidor.')}><Bell size={18}/></button><div className="date"><CalendarDays size={15}/>{new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(currentDate)} · {new Intl.DateTimeFormat('es-PE',{hour:'numeric',minute:'2-digit',hour12:true}).format(currentDate)}</div></div></header>
      <Outlet/>
    </main>
  </div>;
}

