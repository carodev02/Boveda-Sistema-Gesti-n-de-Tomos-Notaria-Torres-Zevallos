export const roles = ['Notario', 'Administrador', 'Secretaria', 'Archivador'];
export const defaultRole = 'Notario';
export function isRole(value) { return roles.some(role => role === value); }
export function userInitials(username) { const base = username.split('@')[0].replace(/[._-]+/g, ' ').trim(); return base.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'UL'; }
