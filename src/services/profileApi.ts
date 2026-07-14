import type {Role} from '../data/roles';
import {apiRequest} from './apiClient';
import {authApi,normalizeUser,type AuthSession} from './authApi';

export type Profile={id:string;fullName:string;username:string;email:string;phone:string;avatar:string;role:Role;status:'Activo'|'Inactivo'|'Bloqueado'|'Pendiente de activación';lastAccess:string;createdAt:string};
type RawProfile=Parameters<typeof normalizeUser>[0];
const profile=(raw:RawProfile):Profile=>{const user=normalizeUser(raw);return {id:user.id,fullName:user.fullName,username:user.username??user.email,email:user.email,phone:user.phone??'',avatar:user.avatarUrl??'',role:user.role,status:user.status,lastAccess:user.lastAccessAt??'',createdAt:user.createdAt}};
export const profileApi={get:async()=>profile(await apiRequest<RawProfile>('/profile')),update:async(changes:Pick<Profile,'fullName'|'email'|'phone'>)=>profile(await apiRequest<RawProfile>('/profile',{method:'PATCH',body:JSON.stringify(changes)})),changePassword:authApi.changePassword,sessions:():Promise<AuthSession[]>=>authApi.sessions(),revokeSession:authApi.revokeSession,revokeOthers:authApi.revokeOthers};
