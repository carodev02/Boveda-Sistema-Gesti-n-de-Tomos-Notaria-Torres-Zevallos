import {apiRequest} from './apiClient';

export type RequestedRole='ADMINISTRADOR'|'SECRETARIA'|'ARCHIVADOR';
export type RegistrationInput={fullName:string;email:string;password:string;confirmPassword:string;requestedRole:RequestedRole};

export const registrationApi={
  create:(input:RegistrationInput)=>apiRequest<{message:string}>('/auth/register',{method:'POST',body:JSON.stringify(input)})
};

