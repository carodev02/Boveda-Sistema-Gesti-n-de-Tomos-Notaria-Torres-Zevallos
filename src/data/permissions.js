const notary = ['users.view', 'users.create', 'users.edit', 'users.activate', 'users.deactivate', 'users.block', 'users.unblock', 'users.resetPassword', 'users.changeRole', 'users.softDelete'];
const administrator = [...notary, 'users.hardDelete', 'settings.critical', 'backups.manage', 'audit.view', 'audit.delete'];
const notaryWithAudit = [...notary, 'settings.functional', 'audit.view'];
export const permissionsByRole = { Administrador: [...administrator, 'settings.functional'], Notario: notaryWithAudit, Secretaria: [], Archivador: [] };
export function hasPermission(role, permission) { return permissionsByRole[role].includes(permission); }
export const rolesAssignableByNotary = ['Notario', 'Secretaria', 'Archivador'];
