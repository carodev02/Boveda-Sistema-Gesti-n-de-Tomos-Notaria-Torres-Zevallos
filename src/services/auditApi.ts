import {apiRequest} from './apiClient';

type RawAudit={id:string;action:string;module:string;targetType:string|null;targetId:string|null;detail:string|null;result:'EXITOSO'|'ERROR'|'DENEGADO';createdAt:string;user:{username:string|null;email:string;fullName:string;role:'ADMINISTRADOR'|'NOTARIO'|'SECRETARIA'|'ARCHIVADOR'|'AUDITOR';status:'ACTIVO'|'INACTIVO'|'BLOQUEADO'|'PENDIENTE';deletedAt:string|null}|null};
const role:Record<NonNullable<RawAudit['user']>['role'],string>={ADMINISTRADOR:'Administrador',NOTARIO:'Notario',SECRETARIA:'Secretaria',ARCHIVADOR:'Archivador',AUDITOR:'Auditor'};
const actionLabels:Record<string,string>={LOGIN_SUCCESS:'Inicio de sesión exitoso',PROFILE_UPDATED:'Perfil actualizado',USER_SOFT_DELETED:'Usuario desactivado',LOGIN_FAILED:'Inicio de sesión fallido',LOGOUT:'Cierre de sesión',USER_UNBLOCKED:'Usuario desbloqueado',LOGIN_BLOCKED:'Acceso bloqueado',USER_BLOCKED:'Usuario bloqueado',USER_ACTIVATED:'Usuario activado',USER_APPROVED:'Cuenta aprobada',USER_REJECTED:'Cuenta rechazada',USER_CREATED:'Cuenta creada',USER_ROLE_REQUESTED:'Rol solicitado',USER_UPDATED:'Usuario actualizado',USER_DEACTIVATED:'Usuario desactivado',USER_ROLE_CHANGED:'Rol asignado',PASSWORD_RESET:'Contraseña restablecida',PASSWORD_CHANGED:'Contraseña actualizada',PASSWORD_CHANGE_REJECTED:'Cambio de contraseña rechazado',SESSION_REVOKED:'Sesión cerrada',OTHER_SESSIONS_REVOKED:'Otras sesiones cerradas',UNAUTHORIZED_ACCESS:'Acceso no autorizado',CZUR_SCAN_STARTED:'Escaneo CZUR iniciado',MANUAL_PDF_SELECTED:'PDF manual seleccionado',CLEAN_PDF_GENERATED:'PDF limpio generado',DOCUMENT_SCAN_CANCELLED:'Digitalización cancelada',DOCUMENT_UPLOAD_COMPLETED:'Carga de PDF completada',OCR_STARTED:'OCR iniciado',OCR_COMPLETED:'OCR completado',OCR_FAILED:'OCR fallido',DOCUMENT_REVIEW_CONFIRMED:'Revisión confirmada',DOCUMENT_CREATED:'Documento confirmado',DOCUMENT_DOWNLOADED:'Documento descargado',DOCUMENT_DELETED:'Documento eliminado',CONFIGURATION_UPDATED:'Configuración actualizada'};

const supplementalActionLabels:Record<string,string>={
  TOME_NUMBER_UPDATED:'Número de tomo actualizado',
  DOCUMENT_TYPE_GROUP_UPDATED:'Tipo documental actualizado',
  DOCUMENT_METADATA_UPDATED:'Información documental actualizada',
  DOCUMENT_JOB_CANCELLED:'Trabajo documental cancelado',
  DOCUMENT_SAVE_STARTED:'Guardado de documento iniciado',
  DOCUMENT_TEST_PERMANENTLY_DELETED:'Documento de prueba eliminado definitivamente',
  IMPORT_FILE_FAILED:'Archivo de importación fallido',
  IMPORT_FILE_UPLOADED:'Archivo de importación cargado',
  DATA_MOJIBAKE_REPAIRED:'Caracteres dañados reparados',
  NOTARY_SECOND_ACCOUNT_ATTEMPT:'Intento de crear un segundo Notario',
  QUALITY_ANALYSIS_COMPLETED:'Análisis de calidad completado',
  QUALITY_OVERRIDE_ACCEPTED:'Excepción de calidad aceptada',
  USER_PERMANENTLY_DELETED:'Usuario eliminado definitivamente',
};

export function auditActionLabel(code:string){return actionLabels[code]??supplementalActionLabels[code]??code.toLowerCase().split('_').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ')}
export type CentralAuditRecord={id:string;date:string;time:string;username:string;userFullName:string;userStatus:string|null;userDeletedAt:string|null;role:string;actionCode:string;action:string;module:string;document:string;result:string};

export const auditApi={list:async()=>{const rows=await apiRequest<RawAudit[]>('/audit');return rows.map((row):CentralAuditRecord=>{const date=new Date(row.createdAt);return {id:row.id,date:date.toLocaleDateString('es-PE'),time:date.toLocaleTimeString('es-PE'),username:row.user?.email??'Sistema',userFullName:row.user?.fullName??'Sistema',userStatus:row.user?.status??null,userDeletedAt:row.user?.deletedAt??null,role:row.user?role[row.user.role]:'Sistema',actionCode:row.action,action:auditActionLabel(row.action),module:row.module,document:row.detail??row.targetId??'—',result:row.result==='EXITOSO'?'Exitoso':row.result==='DENEGADO'?'Denegado':'Error'}})},stats:()=>apiRequest<{activeUsers:number}>('/audit/stats'),record:(action:'CZUR_SCAN_STARTED'|'MANUAL_PDF_SELECTED'|'CLEAN_PDF_GENERATED'|'DOCUMENT_SCAN_CANCELLED',module:string,detail:string,result:'EXITOSO'|'ERROR'|'DENEGADO'='EXITOSO')=>apiRequest<{id:string}>('/audit/events',{method:'POST',body:JSON.stringify({action,module,detail,result})})};


