import type {Role} from './roles';
export type Permission='users.view'|'users.create'|'users.edit'|'users.activate'|'users.deactivate'|'users.block'|'users.unblock'|'users.resetPassword'|'users.changeRole'|'users.softDelete'|'users.hardDelete'|'settings.critical'|'backups.manage'|'audit.delete';
const notary:Permission[]=['users.view','users.create','users.edit','users.activate','users.deactivate','users.block','users.unblock','users.resetPassword','users.changeRole','users.softDelete'];
const administrator:Permission[]=['settings.critical','backups.manage','audit.delete'];
export const permissionsByRole:Record<Role,readonly Permission[]>={Administrador:administrator,Notario:notary,Secretaria:[],Archivador:[],Auditor:[]};
export function hasPermission(role:Role,permission:Permission){return permissionsByRole[role].includes(permission)}
export const rolesAssignableByNotary:Role[]=['Notario','Secretaria','Archivador','Auditor'];
