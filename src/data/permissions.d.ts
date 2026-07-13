import type { Role } from './roles';
export type Permission = 'users.view' | 'users.create' | 'users.edit' | 'users.activate' | 'users.deactivate' | 'users.block' | 'users.unblock' | 'users.resetPassword' | 'users.changeRole' | 'users.softDelete' | 'users.hardDelete' | 'settings.critical' | 'backups.manage' | 'audit.delete';
export declare const permissionsByRole: Record<Role, readonly Permission[]>;
export declare function hasPermission(role: Role, permission: Permission): boolean;
export declare const rolesAssignableByNotary: Role[];
