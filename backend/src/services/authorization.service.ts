import {Role,UserStatus,type User} from '@prisma/client';
import {HttpError} from '../utils/http.js';

export const userManagerRoles:Role[]=[Role.NOTARIO,Role.ADMINISTRADOR];
export const assignableByNotary:Role[]=[Role.NOTARIO,Role.SECRETARIA,Role.ARCHIVADOR,Role.AUDITOR];
export const privilegedRoles:Role[]=[Role.NOTARIO,Role.ADMINISTRADOR];

export function assertCanManage(actor:{id:string;role:Role},target:Pick<User,'id'|'role'|'protectedAccount'>,operation:'edit'|'status'|'role'|'delete'){
  if(!userManagerRoles.includes(actor.role))throw new HttpError(403,'No tiene permiso para administrar usuarios.');
  if(actor.id===target.id&&['status','delete'].includes(operation))throw new HttpError(409,'No puede bloquear, desactivar ni eliminar su propia cuenta.');
  if(target.protectedAccount&&actor.role!==Role.ADMINISTRADOR)throw new HttpError(403,'La cuenta está protegida.');
}

export function assertAssignableRole(actorRole:Role,nextRole:Role){
  if(actorRole===Role.NOTARIO&&!assignableByNotary.includes(nextRole))throw new HttpError(403,'El Notario no puede asignar ese rol.');
}

export function isActivePrivileged(user:Pick<User,'role'|'status'|'deletedAt'>){
  return privilegedRoles.includes(user.role)&&user.status===UserStatus.ACTIVO&&!user.deletedAt;
}
