/* eslint-disable react-hooks/set-state-in-effect */
import {useEffect,useMemo,useRef,useState} from 'react';
import {Ban,CheckCircle2,Edit3,Eye,KeyRound,Lock,MoreHorizontal,Plus,Search,ShieldCheck,Trash2,Unlock,UserCog,X,XCircle} from 'lucide-react';
import {useAuth} from '../auth/AuthContext';
import {roles,type Role} from '../data/roles';
import {usersApi,type AccountStatus,type UserAccount} from '../services/usersApi';
import {addNotification} from '../services/notifications';
import './users.css';
import './users-pending.css';

type Action='detail'|'edit'|'role'|'reset-password'|'activate'|'deactivate'|'block'|'unblock'|'reject'|'delete'|'create';
type UserForm={username:string;fullName:string;email:string;phone:string;role:Role;status:AccountStatus};
const sensitive=new Set<Action>(['role','deactivate','block','reject','delete']);
const accountStatuses:AccountStatus[]=['Activo','Pendiente de activación','Inactivo','Bloqueado'];
const emptyForm:UserForm={username:'',fullName:'',email:'',phone:'',role:'Secretaria',status:'Activo'};

function statusClass(status:AccountStatus){return status==='Activo'?'success':status==='Bloqueado'?'danger':status==='Pendiente de activación'?'warning':'neutral'}

export function Usuarios(){
  const {user:authenticatedUser}=useAuth();
  const [users,setUsers]=useState<UserAccount[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [roleFilter,setRoleFilter]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [selected,setSelected]=useState<UserAccount>();
  const [action,setAction]=useState<Action>();
  const [reason,setReason]=useState('');
  const [newRole,setNewRole]=useState<Role>('Secretaria');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [form,setForm]=useState<UserForm>(emptyForm);
  const executionRef=useRef(false);
  const currentId=authenticatedUser?.id??'';

  async function load(){setLoading(true);setError('');try{setUsers(await usersApi.list())}catch(cause){setError(cause instanceof Error?cause.message:'No se pudo cargar usuarios.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);

  const filtered=useMemo(()=>users.filter(user=>`${user.username} ${user.fullName} ${user.email}`.toLowerCase().includes(query.toLowerCase())&&(!roleFilter||user.role===roleFilter)&&(!statusFilter||user.status===statusFilter)),[users,query,roleFilter,statusFilter]);

  function open(next:Action,user?:UserAccount){
    setSelected(user);setAction(next);setReason('');setError('');setNotice('');setNewRole(user?.role??'Secretaria');
    if(next==='edit'&&user)setForm({username:user.username??user.email,fullName:user.fullName,email:user.email,phone:user.phone,role:user.role,status:user.status});
    if(next==='create')setForm(emptyForm);
  }
  function close(){if(!busy){setAction(undefined);setSelected(undefined);setReason('');setError('')}}

  async function execute(){
    if(!action||executionRef.current)return;
    if((action==='create'||action==='edit')&&(!form.username.trim()||!form.fullName.trim()||!form.email.trim())){setError('Completa los campos obligatorios.');return}
    if(sensitive.has(action)&&!reason.trim()){setError('Debes indicar un motivo para continuar.');return}
    executionRef.current=true;
    setBusy(true);setError('');
    try{
      if(action==='create'){
        const created=await usersApi.create({...form,reason:'Creación autorizada'});
        if(created.temporaryPassword)setNotice(`Cuenta creada. Contraseña temporal: ${created.temporaryPassword}`);
      }else if(action==='edit'&&selected)await usersApi.update(selected.id,form);
      else if(action==='role'&&selected)await usersApi.changeRole(selected.id,newRole,reason);
      else if(action==='delete'&&selected){await usersApi.remove(selected.id,reason);setNotice('Cuenta eliminada correctamente.');addNotification('delete','Cuenta eliminada',`${selected.fullName} · ${selected.email}`);}
      else if(selected&&['reset-password','activate','deactivate','block','unblock','reject'].includes(action)){
        const result=await usersApi.action(selected.id,action as 'reset-password'|'activate'|'deactivate'|'block'|'unblock'|'reject',reason);
        if(action==='reset-password'&&'temporaryPassword' in result)setNotice(`Contraseña restablecida. Contraseña temporal: ${result.temporaryPassword}`);
        else setNotice('Acción completada correctamente.');
      }
      await load();
      setAction(undefined);setSelected(undefined);setReason('');setError('');
    }catch(cause){setError(cause instanceof Error?cause.message:'No se pudo completar la acción.')}finally{executionRef.current=false;setBusy(false)}
  }

  return <div className="page-content usersPage">
    <section className="card usersControls">
      <div><h2>Administración de cuentas</h2><p>Control operativo de usuarios registrados en Bóveda.</p></div>
      <button className="btn primary" onClick={()=>open('create')}><Plus/>Nuevo usuario</button>
      <div className="usersViewTabs"><button className={!statusFilter?'active':''} onClick={()=>setStatusFilter('')}>Todas las cuentas</button>{(()=>{const pendingCount=users.filter(user=>user.status==='Pendiente de activación').length;return <button className={statusFilter==='Pendiente de activación'?'active':''} onClick={()=>setStatusFilter('Pendiente de activación')}>Cuentas pendientes {pendingCount>0&&<span>{pendingCount}</span>}</button>})()}</div>
      <div className="usersFilters">
        <label><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar nombre o correo..."/></label>
        <select className="field" value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="">Todos los roles</option>{roles.map(role=><option key={role}>{role}</option>)}</select>
        <select className="field" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="">Todos los estados</option>{accountStatuses.map(status=><option key={status}>{status}</option>)}</select>
        <span>{filtered.length} {filtered.length===1?'cuenta':'cuentas'}</span>
      </div>
    </section>
    {notice&&<div className="usersAlert">{notice}</div>}
    {error&&!action&&<div className="usersAlert"><Ban/>{error}</div>}
    <section className="card usersTableCard">
      {loading?<div className="usersEmpty">Cargando cuentas…</div>:filtered.length===0?<div className="usersEmpty"><UserCog/><h3>No se encontraron usuarios</h3><p>Modifica los filtros o registra una cuenta.</p></div>:<div className="usersTableViewport"><table>
        <thead><tr><th>Identificador</th><th>Nombre completo</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Fecha de creación</th><th>Acciones</th></tr></thead>
        <tbody>{filtered.map(user=><tr key={user.id}>
          <td><b>{user.username??user.email}</b>{user.protectedAccount&&<small><ShieldCheck/>Protegida</small>}</td><td>{user.fullName}</td><td>{user.email}</td><td>{user.role}</td><td><span className={`badge ${statusClass(user.status)}`}>{user.status}</span></td><td>{user.lastAccess==='Sin acceso'?'Sin acceso':new Date(user.lastAccess).toLocaleString('es-PE')}</td><td>{new Date(user.createdAt).toLocaleDateString('es-PE')}</td>
          <td><div className="userActions"><button type="button" title="Ver detalle" onClick={()=>open('detail',user)}><Eye/></button><button type="button" title="Editar" disabled={user.protectedAccount} onClick={()=>open('edit',user)}><Edit3/></button><button type="button" title="Cambiar rol" disabled={user.protectedAccount} onClick={()=>open('role',user)}><UserCog/></button><button type="button" title="Restablecer contraseña" disabled={user.protectedAccount} onClick={()=>open('reset-password',user)}><KeyRound/></button>{user.status!=='Activo'&&user.status!=='Bloqueado'&&<button type="button" title="Activar" disabled={user.protectedAccount} onClick={()=>open('activate',user)}><CheckCircle2/></button>}{user.status==='Pendiente de activación'&&<button type="button" title="Rechazar cuenta" disabled={user.protectedAccount} onClick={()=>open('reject',user)}><XCircle/></button>}{user.status==='Activo'&&<button type="button" title="Desactivar" disabled={user.id===currentId||user.protectedAccount} onClick={()=>open('deactivate',user)}><Ban/></button>}{user.status!=='Bloqueado'?<button type="button" title="Bloquear" disabled={user.id===currentId||user.protectedAccount} onClick={()=>open('block',user)}><Lock/></button>:<button type="button" title="Desbloquear" disabled={user.protectedAccount} onClick={()=>open('unblock',user)}><Unlock/></button>}<button type="button" title="Eliminar lógicamente" disabled={user.id===currentId||user.protectedAccount} onClick={()=>open('delete',user)}><Trash2/></button><button type="button" title="Más información" onClick={()=>open('detail',user)}><MoreHorizontal/></button></div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {action&&<div className="modalBackdrop" role="presentation"><section className="card userModal" role="dialog" aria-modal="true" aria-label="Acción sobre usuario">
      <header><div><h2>{action==='create'?'Nuevo usuario':action==='detail'?'Detalle de cuenta':action==='edit'?'Editar usuario':action==='role'?'Cambiar rol':action==='delete'?'Eliminar cuenta':action==='reset-password'?'Restablecer contraseña':action==='activate'?'Activar cuenta':action==='deactivate'?'Desactivar cuenta':action==='block'?'Bloquear cuenta':action==='reject'?'Rechazar cuenta':'Desbloquear cuenta'}</h2><p>{selected?`${selected.fullName} · ${selected.email}`:'Registra únicamente una cuenta real autorizada.'}</p></div><button onClick={close} aria-label="Cerrar"><X/></button></header>
      {action==='detail'&&selected?<dl className="userDetail"><div><dt>Estado actual</dt><dd><span className={`badge ${statusClass(selected.status)}`}>{selected.status}</span></dd></div><div><dt>Actividad reciente</dt><dd>{selected.recentActivity}</dd></div><div><dt>Intentos fallidos</dt><dd>{selected.failedAttempts}</dd></div><div><dt>Cuenta protegida</dt><dd>{selected.protectedAccount?'Sí':'No'}</dd></div></dl>:action==='create'||action==='edit'?<div className="userForm">
        <label>USUARIO<input className="field" required value={form.username} onChange={event=>setForm({...form,username:event.target.value})}/></label>
        <label>NOMBRE COMPLETO<input className="field" required value={form.fullName} onChange={event=>setForm({...form,fullName:event.target.value})}/></label>
        <label>CORREO<input className="field" type="email" required value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label>
        <label>TELÉFONO<input className="field" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/></label>
        {action==='create'&&<><label>ROL<select className="field" value={form.role} onChange={event=>setForm({...form,role:event.target.value as Role})}>{roles.map(role=><option key={role}>{role}</option>)}</select></label><label>ESTADO<select className="field" value={form.status} onChange={event=>setForm({...form,status:event.target.value as AccountStatus})}>{accountStatuses.map(status=><option key={status}>{status}</option>)}</select></label><label>CONTRASEÑA TEMPORAL<input className="field" disabled value="Se generará al crear la cuenta"/><small>Se mostrará una sola vez y deberá cambiarse en el primer inicio.</small></label></>}
      </div>:<div className="sensitiveAction">{action==='role'&&<label>NUEVO ROL<select className="field" value={newRole} onChange={event=>setNewRole(event.target.value as Role)}>{roles.map(role=><option key={role}>{role}</option>)}</select></label>}{sensitive.has(action)&&<label>MOTIVO OBLIGATORIO<textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder="Indica el motivo de esta acción sensible"/></label>}<p>Esta acción se registrará en Auditoría central con el usuario ejecutor y la cuenta afectada.</p></div>}
      {error&&<div className="modalError">{error}</div>}
      <footer><button className="btn" onClick={close}>Cancelar</button>{action!=='detail'&&<button className={action==='delete'?'btn dangerButton':'btn primary'} disabled={busy} onClick={()=>void execute()}>{busy?'Procesando…':'Confirmar acción'}</button>}</footer>
    </section></div>}
  </div>;
}

