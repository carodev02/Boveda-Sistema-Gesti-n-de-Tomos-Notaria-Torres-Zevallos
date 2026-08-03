import type {Role} from './roles';
export type Permission='users.view'|'users.create'|'users.edit'|'users.activate'|'users.deactivate'|'users.block'|'users.unblock'|'users.resetPassword'|'users.changeRole'|'users.softDelete'|'users.hardDelete'|'settings.functional'|'settings.critical'|'backups.manage'|'audit.view'|'audit.delete'|'reports.view';
const notary:Permission[]=['users.view','users.create','users.edit','users.activate','users.deactivate','users.block','users.unblock','users.resetPassword','users.changeRole','users.softDelete'];
const administrator:Permission[]=[...notary,'users.hardDelete','settings.critical','backups.manage','audit.view','audit.delete'];
const notaryWithAudit:Permission[]=[...notary,'settings.functional','audit.view'];
export const permissionsByRole:Record<Role,readonly Permission[]>={Administrador:[...administrator,'settings.functional','reports.view'],Notario:[...notaryWithAudit,'reports.view'],Secretaria:['reports.view'],Archivador:['reports.view']};
export function hasPermission(role:Role,permission:Permission){return permissionsByRole[role].includes(permission)}
export const rolesAssignableByNotary:Role[]=['Notario','Secretaria','Archivador'];



