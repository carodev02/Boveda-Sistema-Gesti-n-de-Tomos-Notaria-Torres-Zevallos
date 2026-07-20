export type DocumentClass='MINUTA'|'REGISTRO_NOTARIAL';
export type ProcessingStatus='PENDING'|'PROCESSING'|'COMPLETED'|'FAILED';
export type StorageStatus='TEMPORARY'|'PENDING_ARCHIVE'|'ARCHIVED'|'FAILED';

export type KardexCaseStatus='UNLINKED'|'PARTIALLY_LINKED'|'LINKED'|'REVIEW_REQUIRED';
export interface KardexCase{
  id:string;
  kardexNumber:string;
  legalActId:string;
  primaryContractorId:string;
  status:KardexCaseStatus;
  createdAt:string;
  updatedAt:string;
}

export interface Document{
  id:string;
  kardexCaseId?:string;
  documentClass:DocumentClass;
  registryTypeId?:string;
  instrumentType?:string;
  instrumentNumber?:string;
  minuteNumber?:string;
  printedFolio?:number;
  destinationRegistryTypeId?:string;
  destinationInstrumentNumber?:string;
  documentDate?:string;
  qrUrl?:string;
  originalFilename:string;
  normalizedFilename?:string;
  storageStatus:StorageStatus;
  processingStatus:ProcessingStatus;
}

export interface DocumentLocation{
  documentId?:string;
  year?:number;
  bienniumStart?:number;
  bienniumEnd?:number;
  tomeNumber?:string;
  folioQuantity:number;
}

export interface Contractor{
  id:string;
  normalizedName:string;
  displayName:string;
}

export interface LegalAct{
  id:string;
  name:string;
  active:boolean;
}

export interface RegistryType{
  id:string;
  name:string;
  active:boolean;
  tomeRequired:boolean;
}

export type ImportSourceType='DOCUMENT_FOLDER'|'EXCEL_INDEX';
export type ImportJobStatus='IDLE'|'SELECTING_FOLDER'|'INVENTORY_RUNNING'|'INVENTORY_PAUSED'|'INVENTORY_COMPLETED'|'INVENTORY_CANCELLED'|'INVENTORY_FAILED';
export interface ImportJob{
  id:string;
  sourceType:ImportSourceType;
  status:ImportJobStatus;
  totalFiles:number;
  totalBytes:number;
  inventoriedFiles:number;
  uploadedFiles:number;
  processedFiles:number;
  confirmedFiles:number;
  reviewFiles:number;
  failedFiles:number;
  folderCount:number;
  pdfFiles:number;
  excelFiles:number;
  unsupportedFiles:number;
  batchSize:number;
  cursor:number;
  folderName?:string;
  errorMessage?:string;
  createdAt:string;
  updatedAt:string;
}

export type DetectionSource='FOLDER'|'FILENAME';
export interface DetectedValue{
  value:string;
  source:DetectionSource;
  confidence:number;
  originalText:string;
  pathSegmentIndex:number;
}

export type PreliminaryDocumentClass=DocumentClass|'UNKNOWN';
export type InventoryAnalysisStatus='PENDING'|'ANALYZED'|'UNSUPPORTED'|'ERROR'|'IGNORED';
export interface InventoryFile{
  id:string;
  jobId:string;
  relativePath:string;
  originalName:string;
  extension:string;
  size:number;
  modifiedAt?:number;
  depth:number;
  parentFolders:string[];
  preliminaryClass:PreliminaryDocumentClass;
  kardex?:DetectedValue;
  registryType?:DetectedValue;
  period?:DetectedValue;
  tome?:DetectedValue;
  folios?:DetectedValue;
  contractor?:DetectedValue;
  legalAct?:DetectedValue;
  analysisStatus:InventoryAnalysisStatus;
  error?:string;
  errorStage?:string;
  retryable?:boolean;
  proposedNormalizedFilename?:string;
  componentPaths?:string[];
  logicalPageGroup?:boolean;
}

export type ExcelTargetField='correlative'|'kardexNumber'|'tomeNumber'|'year'|'biennium'|'instrumentType'|'instrumentNumber'|'minuteNumber'|'legalAct'|'contractor'|'folios'|'date'|'registryType'|'observations'|'IGNORE';
export interface ExcelColumnProfile{
  index:number;
  header:string;
  normalizedHeader:string;
  suggestedTarget:ExcelTargetField;
  target:ExcelTargetField;
  emptyCells:number;
  duplicateHeader:boolean;
  apparentTypes:string[];
}
export interface ExcelSheetProfile{
  name:string;
  headerRowNumber:number;
  rowCount:number;
  headers:string[];
  columns:ExcelColumnProfile[];
  sampleRows:unknown[][];
  derivedValues?:Partial<Record<Exclude<ExcelTargetField,'IGNORE'>,string|number>>;
}
export interface ExcelWorkbookProfile{
  fileName:string;
  sheetNames:string[];
  selectedSheet:string;
  sheets:ExcelSheetProfile[];
}
export interface NormalizedExcelCell{
  rawValue:unknown;
  normalizedValue:string|number|boolean|null;
  rowNumber:number;
  columnName:string;
  validationErrors:string[];
}
export interface NormalizedExcelRow{
  id:string;
  jobId:string;
  sheetName:string;
  rowNumber:number;
  values:Partial<Record<Exclude<ExcelTargetField,'IGNORE'>,NormalizedExcelCell>>;
}

export type ValidationMatchStatus='MATCHED'|'PARTIAL_MATCH'|'CONFLICT'|'NOT_FOUND_IN_EXCEL'|'DUPLICATE_IN_EXCEL'|'KARDEX_NOT_DETECTED';
export type PdfReadStatus='PENDING'|'READING'|'TEXT_EXTRACTED'|'OCR_COMPLETED'|'ERROR';
export interface PdfDocumentEvidence{
  analysisVersion?:number;
  status:PdfReadStatus;
  pageCount:number;
  textCharacters:number;
  usedOcr:boolean;
  analyzedAt:string;
  fields:Partial<Record<'kardexNumber'|'minuteNumber'|'printedFolio'|'instrumentType'|'instrumentNumber'|'contractor'|'documentDate'|'documentClass'|'unclassifiedAv',string>>;
  legalAct?:string;
  averageConfidence?:number;
  error?:string;
}
export interface ImportValidationResult{
  id:string;
  jobId:string;
  inventoryFileId:string;
  excelRowIds:string[];
  status:ValidationMatchStatus;
  conflicts:string[];
  multipleContractors:string[];
  legalAct?:string;
  fileSnapshot?:InventoryFile;
  pdfEvidence?:PdfDocumentEvidence;
  pdfConflicts?:string[];
  resolvedFields?:Partial<Record<'documentClass'|'period'|'tome'|'folios'|'kardexNumber'|'minuteNumber'|'instrumentType'|'instrumentNumber'|'legalAct'|'contractor'|'documentDate',{value:string;source:'PDF'|'EXCEL'|'FOLDER'|'FILENAME';confirmed:boolean}>>;
  registeredAt?:string;
  registrationError?:string;
}

export type ScanSessionStatus='CREATED'|'CZUR_OPENING'|'WAITING_FOR_SCAN'|'FILE_DETECTED'|'FILE_STABILIZING'|'COPYING'|'PREPROCESSING'|'READY_FOR_REVIEW'|'CANCELLED'|'FAILED';
export interface NormalizedPoint{x:number;y:number}
export interface PageCorners{topLeft:NormalizedPoint;topRight:NormalizedPoint;bottomRight:NormalizedPoint;bottomLeft:NormalizedPoint}
export interface ScanPage{
  id:string;
  originalPageNumber:number;
  currentOrder:number;
  width:number;
  height:number;
  resolution:number;
  rotation:number;
  excluded:boolean;
  originalPreviewUrl:string;
  processedPreviewUrl:string;
  detectedCorners?:PageCorners;
  cropConfidence?:number;
  perspectiveApplied:boolean;
  requiresManualReview:boolean;
  transformations:string[];
}
export interface ScanSession{
  id:string;
  sourceType?:'CZUR'|'MANUAL';
  acquisitionId?:string;
  documentClass:DocumentClass;
  registryTypeId:string;
  tomeNumber:string;
  folioQuantity:number;
  year?:number;
  bienniumStart?:number;
  bienniumEnd?:number;
  startedAt:string;
  czurOpenedAt?:string;
  detectedFilePath?:string;
  temporaryCopyPath?:string;
  originalFileName?:string;
  cleanPdfPath?:string;
  cleanPdfFilename?:string;
  pageCount:number;
  status:ScanSessionStatus;
  error?:string;
  pages:ScanPage[];
}
export interface CzurConfiguration{
  executableConfigured:boolean;
  exportFolderConfigured:boolean;
  temporaryFolderConfigured:boolean;
  executableDisplayName?:string;
  exportFolderDisplayName?:string;
  temporaryFolderDisplayName?:string;
  lastCheckedAt?:string;
  detectedVersion?:string;
  valid:boolean;
  issues:string[];
}
export type ScanUiStatus='IDLE'|'CHECKING_CZUR'|'OPENING_CZUR'|'WAITING_FOR_SCAN'|'SCAN_DETECTED'|'RECEIVING_FILE'|'PREPARING_PAGES'|'READY_FOR_REVIEW'|'ERROR';

export interface ScanConfiguration{
  documentClass:DocumentClass;
  registryTypeId:string;
  tomeNumber:string;
  folioQuantity:string;
  folioRangeStart?:number;
  folioRangeEnd?:number;
  period:string;
}

export interface ReviewValues{
  kardexNumber:string;
  minuteNumber:string;
  printedFolio:string;
  instrumentType:string;
  instrumentNumber:string;
  destinationRegistryTypeId:string;
  destinationInstrumentNumber:string;
  documentDate:string;
  legalActId:string;
  primaryContractor:string;
  qrUrl:string;
}
