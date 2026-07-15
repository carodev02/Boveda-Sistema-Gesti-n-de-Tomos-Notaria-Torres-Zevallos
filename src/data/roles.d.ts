export declare const roles: readonly ["Notario", "Administrador", "Secretaria", "Archivador"];
export type Role = (typeof roles)[number];
export declare const defaultRole: Role;
export declare function isRole(value: string | null): value is Role;
export declare function userInitials(username: string): string;
