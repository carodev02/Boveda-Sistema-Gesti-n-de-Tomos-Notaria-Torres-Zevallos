const normalizeStatus=(value:unknown)=>String(value??'').trim().toUpperCase();

const documentStatusLabels:Record<string,string>={
  CONFIRMED:'Registrado',
  ACTIVE:'Vigente',
  DELETED:'Eliminado',
  ARCHIVED:'Archivado',
  PENDING:'Pendiente de registro',
};

const ocrStatusLabels:Record<string,string>={
  PROCESSED:'Lectura completada',
  COMPLETED:'Lectura completada',
  REVIEW_REQUIRED:'Revisión requerida',
  OCR_PENDING:'Lectura pendiente',
  OCR_PROCESSING:'Lectura en curso',
  PROCESSING:'Lectura en curso',
  FAILED:'Lectura fallida',
  ERROR:'Error de lectura',
  CANCELLED:'Lectura cancelada',
};

export const documentStatusLabel=(value:unknown)=>documentStatusLabels[normalizeStatus(value)]??String(value??'').trim();
export const ocrStatusLabel=(value:unknown)=>ocrStatusLabels[normalizeStatus(value)]??String(value??'').trim();
