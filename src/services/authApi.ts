import type {Role} from '../data/roles';import {apiRequest} from './apiClient';
type BackendRole='ADMINISTRADOR'|'NOTARIO'|'SECRETARIA'|'ARCHIVADOR';type BackendStatus='ACTIVO'|'INACTIVO'|'BLOQUEADO'|'PENDIENTE';
const roles:Record<BackendRole,Role>={ADMINISTRADOR:'Administrador',NOTARIO:'Notario',SECRETARIA:'Secretaria',ARCHIVADOR:'Archivador'};
export const statusLabel=(status:BackendStatus)=>({ACTIVO:'Activo',INACTIVO:'Inactivo',BLOQUEADO:'Bloqueado',PENDIENTE:'Pendiente de activación'} as const)[status];
export type AuthUser={id:string;username:string|null;email:string;fullName:string;phone:string|null;avatarUrl:string|null;role:Role;status:'Activo'|'Inactivo'|'Bloqueado'|'Pendiente de activación';lastAccessAt:string|null;createdAt:string;passwordResetRequired?:boolean};
export function normalizeUser(user:Omit<AuthUser,'role'|'status'> & {role:BackendRole;status:BackendStatus}):AuthUser{return {...user,role:roles[user.role],status:statusLabel(user.status)}}
export const roleToBackend=(role:Role)=>role.toUpperCase() as BackendRole;
export const authApi={login:async(email:string,password:string)=>{const data=await apiRequest<{user:Parameters<typeof normalizeUser>[0]}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});return normalizeUser(data.user)},me:async()=>normalizeUser((await apiRequest<{user:Parameters<typeof normalizeUser>[0]}>('/auth/me')).user),logout:()=>apiRequest<void>('/auth/logout',{method:'POST'}),changePassword:(currentPassword:string,newPassword:string)=>apiRequest<void>('/auth/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),sessions:()=>apiRequest<AuthSession[]>('/auth/sessions'),revokeSession:(id:string)=>apiRequest<void>(`/auth/sessions/${id}`,{method:'DELETE'}),revokeOthers:()=>apiRequest<void>('/auth/sessions/others',{method:'DELETE'})};
export type AuthSession={id:string;ipAddress:string|null;userAgent:string|null;createdAt:string;lastActivityAt:string;expiresAt:string;current:boolean};


