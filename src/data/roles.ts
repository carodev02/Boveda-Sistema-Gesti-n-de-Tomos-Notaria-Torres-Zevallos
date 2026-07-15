export const roles=['Notario','Administrador','Secretaria','Archivador'] as const;
export type Role=(typeof roles)[number];
export const defaultRole:Role='Notario';
export function isRole(value:string|null):value is Role{return roles.some(role=>role===value)}
export function userInitials(username:string){const base=username.split('@')[0].replace(/[._-]+/g,' ').trim();return base.split(' ').filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')||'UL'}



