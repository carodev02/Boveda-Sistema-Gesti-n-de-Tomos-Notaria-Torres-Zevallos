import {lazy,Suspense} from 'react';
import {Navigate,Route,Routes,useLocation} from 'react-router-dom';
import {AppLayout} from './components/AppLayout';
import {hasPermission,type Permission} from './data/permissions';
import {useAuth} from './auth/AuthContext';
import './styles/route-loading.css';

const Login=lazy(()=>import('./pages/Login').then(module=>({default:module.Login})));
const Dashboard=lazy(()=>import('./pages/Dashboard').then(module=>({default:module.Dashboard})));
const Digitalizacion=lazy(()=>import('./pages/DigitalizacionProcess').then(module=>({default:module.DigitalizacionProcess})));
const Documentos=lazy(()=>import('./pages/Documentos').then(module=>({default:module.Documentos})));
const Tomos=lazy(()=>import('./pages/Tomos').then(module=>({default:module.Tomos})));
const Visor=lazy(()=>import('./pages/Visor').then(module=>({default:module.Visor})));
const AsistenteIA=lazy(()=>import('./pages/AsistenteIA').then(module=>({default:module.AsistenteIA})));
const Usuarios=lazy(()=>import('./pages/Usuarios').then(module=>({default:module.Usuarios})));
const Configuracion=lazy(()=>import('./pages/Configuracion').then(module=>({default:module.Configuracion})));
const Reportes=lazy(()=>import('./pages/Reportes').then(module=>({default:module.Reportes})));
const Auditoria=lazy(()=>import('./pages/Auditoria').then(module=>({default:module.Auditoria})));
const Perfil=lazy(()=>import('./pages/Perfil').then(module=>({default:module.Perfil})));

function RequireAuth(){const {user,loading}=useAuth();const location=useLocation();if(loading)return <div className="routeLoading" role="status">Validando sesión…</div>;if(!user)return <Navigate to="/login" replace/>;if(user.passwordResetRequired&&(location.pathname!=='/perfil'||new URLSearchParams(location.search).get('panel')!=='password'))return <Navigate to="/perfil?panel=password" replace/>;return <AppLayout/>}
function RequirePermission({permission,children,deniedMessage}:{permission:Permission,children:React.ReactNode,deniedMessage?:string}){const {user}=useAuth();return user&&hasPermission(user.role,permission)?children:<Navigate to="/dashboard" replace state={deniedMessage?{accessDenied:deniedMessage}:undefined}/>}
export default function App(){return <Suspense fallback={<div className="routeLoading" role="status">Cargando sección…</div>}><Routes><Route path="/login" element={<Login/>}/><Route element={<RequireAuth/>}><Route path="/dashboard" element={<Dashboard/>}/><Route path="/digitalizacion" element={<Digitalizacion/>}/><Route path="/documentos" element={<Documentos/>}/><Route path="/tomos" element={<Tomos/>}/><Route path="/visor/:id" element={<Visor/>}/><Route path="/asistente" element={<AsistenteIA/>}/><Route path="/usuarios" element={<RequirePermission permission="users.view"><Usuarios/></RequirePermission>}/><Route path="/configuracion" element={<RequirePermission permission="settings.functional"><Configuracion/></RequirePermission>}/><Route path="/reportes" element={<RequirePermission permission="reports.view"><Reportes/></RequirePermission>}/><Route path="/auditoria" element={<RequirePermission permission="audit.view" deniedMessage="No tienes permisos para acceder a la auditoría."><Auditoria/></RequirePermission>}/><Route path="/perfil" element={<Perfil/>}/></Route><Route path="*" element={<Navigate to="/login" replace/>}/></Routes></Suspense>}
