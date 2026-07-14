import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

export const hashPassword=(password:string)=>bcrypt.hash(password,12);
export const verifyPassword=(password:string,hash:string)=>bcrypt.compare(password,hash);
export const hashToken=(token:string)=>crypto.createHash('sha256').update(token).digest('hex');
export function temporaryPassword(){return `${crypto.randomBytes(9).toString('base64url')}aA1!`}
