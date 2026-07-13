import {Navigate,Route,Routes} from 'react-router-dom';
import {AppLayout} from './components/AppLayout';
import {hasPermission,type Permission} from './data/permissions';
import {defaultRole,isRole} from './data/roles';
import {AsistenteIA} from './pages/AsistenteIA';
import {Configuracion} from './pages/Configuracion';
import {Auditoria} from './pages/Auditoria';
import {Dashboard} from './pages/Dashboard';
import {Digitalizacion} from './pages/Digitalizacion';
import {Documentos} from './pages/Documentos';
import {Login} from './pages/Login';
import {Perfil} from './pages/Perfil';
import {Reportes} from './pages/Reportes';
import {Tomos} from './pages/Tomos';
import {Usuarios} from './pages/Usuarios';
import {Visor} from './pages/Visor';
function RequirePermission({permission,children}:{permission:Permission,children:React.ReactNode}){const stored=localStorage.getItem('sigadn-role');const role=isRole(stored)?stored:defaultRole;return hasPermission(role,permission)?children:<Navigate to="/dashboard" replace/>}
export default function App(){return <Routes><Route path="/login" element={<Login/>}/><Route element={<AppLayout/>}><Route path="/dashboard" element={<Dashboard/>}/><Route path="/digitalizacion" element={<Digitalizacion/>}/><Route path="/documentos" element={<Documentos/>}/><Route path="/tomos" element={<Tomos/>}/><Route path="/visor/:id" element={<Visor/>}/><Route path="/asistente" element={<AsistenteIA/>}/><Route path="/usuarios" element={<RequirePermission permission="users.view"><Usuarios/></RequirePermission>}/><Route path="/configuracion" element={<RequirePermission permission="settings.critical"><Configuracion/></RequirePermission>}/><Route path="/reportes" element={<Reportes/>}/><Route path="/auditoria" element={<Auditoria/>}/><Route path="/perfil" element={<Perfil/>}/></Route><Route path="*" element={<Navigate to="/login" replace/>}/></Routes>}
