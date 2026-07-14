import type {Role} from '../data/roles';
import {apiRequest} from './apiClient';
import {normalizeUser,roleToBackend} from './authApi';

export type AccountStatus='Activo'|'Inactivo'|'Bloqueado'|'Pendiente de activación';
export type UserAccount={id:string;username:string|null;fullName:string;email:string;role:Role;status:AccountStatus;lastAccess:string;createdAt:string;recentActivity:string;failedAttempts:number;protectedAccount:boolean;deletedAt?:string;deletedBy?:string;hasDependencies:boolean;temporaryPassword?:string};
type RawUser=Parameters<typeof normalizeUser>[0]&{failedLoginAttempts:number;protectedAccount:boolean;deletedAt?:string;deletedBy?:string;temporaryPassword?:string};
type UserInput={username:string;fullName:string;email:string;role:Role;status?:AccountStatus;reason?:string};

const statusToBackend=(status:AccountStatus|undefined)=>status==='Activo'?'ACTIVO':status==='Inactivo'?'INACTIVO':status==='Bloqueado'?'BLOQUEADO':'PENDIENTE';

function account(raw:RawUser):UserAccount{
  const user=normalizeUser(raw);
  return {id:user.id,username:user.username,fullName:user.fullName,email:user.email,role:user.role,status:user.status,lastAccess:user.lastAccessAt??'Sin acceso',createdAt:user.createdAt,recentActivity:'Consultar actividad centralizada en Auditoría',failedAttempts:raw.failedLoginAttempts,protectedAccount:raw.protectedAccount,deletedAt:raw.deletedAt,deletedBy:raw.deletedBy,hasDependencies:true,temporaryPassword:raw.temporaryPassword};
}

export const usersApi={
  list:async()=>(await apiRequest<RawUser[]>('/users')).map(account),
  get:async(id:string)=>account(await apiRequest<RawUser>(`/users/${id}`)),
  create:async(data:UserInput)=>account(await apiRequest<RawUser>('/users',{method:'POST',body:JSON.stringify({...data,role:roleToBackend(data.role),status:statusToBackend(data.status)})})),
  update:async(id:string,data:Partial<UserInput>)=>account(await apiRequest<RawUser>(`/users/${id}`,{method:'PATCH',body:JSON.stringify({fullName:data.fullName,email:data.email})})),
  action:async(id:string,action:'activate'|'deactivate'|'block'|'unblock'|'reject'|'reset-password',reason?:string)=>apiRequest<unknown>(`/users/${id}/${action}`,{method:'POST',body:JSON.stringify({reason:reason||'Acción autorizada'})}),
  changeRole:async(id:string,role:Role,reason:string)=>account(await apiRequest<RawUser>(`/users/${id}/change-role`,{method:'POST',body:JSON.stringify({role:roleToBackend(role),reason})})),
  remove:async(id:string,reason:string)=>account(await apiRequest<RawUser>(`/users/${id}`,{method:'DELETE',body:JSON.stringify({reason})}))
};
