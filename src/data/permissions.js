const notary = ['users.view', 'users.create', 'users.edit', 'users.activate', 'users.deactivate', 'users.block', 'users.unblock', 'users.resetPassword', 'users.changeRole', 'users.softDelete'];
const administrator = ['settings.critical', 'backups.manage', 'audit.delete'];
export const permissionsByRole = { Administrador: administrator, Notario: notary, Secretaria: [], Archivador: [], Auditor: [] };
export function hasPermission(role, permission) { return permissionsByRole[role].includes(permission); }
export const rolesAssignableByNotary = ['Notario', 'Secretaria', 'Archivador', 'Auditor'];
