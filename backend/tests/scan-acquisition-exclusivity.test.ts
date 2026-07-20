import {beforeEach,describe,expect,it} from 'vitest';
import {scanWorkflowStore} from '../../src/services/scanWorkflowStore';

describe('exclusividad de adquisición',()=>{
  beforeEach(()=>scanWorkflowStore.finishAcquisition('CANCELLED'));
  it('impide iniciar manual durante CZUR y libera al cancelar',()=>{
    expect(scanWorkflowStore.beginAcquisition('CZUR','session-1')).toBe(true);
    expect(scanWorkflowStore.beginAcquisition('MANUAL')).toBe(false);
    expect(scanWorkflowStore.get().acquisitionMode).toBe('CZUR');
    scanWorkflowStore.finishAcquisition('CANCELLED');
    expect(scanWorkflowStore.beginAcquisition('MANUAL','session-2')).toBe(true);
  });
  it('bloquea el doble clic sin esperar operaciones asíncronas',()=>{
    expect(scanWorkflowStore.beginAcquisition('CZUR','session-1')).toBe(true);
    expect(scanWorkflowStore.beginAcquisition('CZUR','session-2')).toBe(false);
    expect(scanWorkflowStore.get().acquisitionSessionId).toBe('session-1');
  });
  it('limpia resultados anteriores sin borrar la configuración nueva',()=>{
    scanWorkflowStore.setConfiguration({documentClass:'MINUTA',registryTypeId:'',tomeNumber:'80',folioQuantity:'22-24',period:'2026'});
    scanWorkflowStore.setOcrResults({pages:[{}],fields:[{fieldName:'kardexNumber'}],reviewCount:1});
    scanWorkflowStore.resetProcessingState();
    expect(scanWorkflowStore.get().configuration?.tomeNumber).toBe('80');
    expect(scanWorkflowStore.get().extractedFields).toBeUndefined();
    expect(scanWorkflowStore.get().cleanPdfReady).toBe(false);
  });
  it.each(['MANUAL','CZUR'] as const)('libera adquisición %s al cancelar desde Control previo',mode=>{
    expect(scanWorkflowStore.beginAcquisition(mode,'session-preview')).toBe(true);
    scanWorkflowStore.setCleanPdfReady(true);
    scanWorkflowStore.setUploadResult({uploadId:'upload-old',documentId:'document-old',status:'UPLOADED'});
    scanWorkflowStore.setOcrResults({pages:[{}],fields:[{}],reviewCount:1});
    scanWorkflowStore.finishAcquisition('CANCELLED');scanWorkflowStore.resetWorkflow();scanWorkflowStore.resetProcessingState();
    expect(scanWorkflowStore.get()).toMatchObject({acquisitionMode:'IDLE',acquisitionStatus:'CANCELLED',pages:[],cleanPdfReady:false});
    expect(scanWorkflowStore.get().uploadId).toBeUndefined();expect(scanWorkflowStore.get().extractedFields).toBeUndefined();
    expect(scanWorkflowStore.beginAcquisition(mode,'session-next')).toBe(true);
    scanWorkflowStore.finishAcquisition('CANCELLED');
  });
  it('restablece atómicamente el documento actual',()=>{scanWorkflowStore.beginAcquisition('CZUR','session-active');scanWorkflowStore.setCleanPdfReady(true);scanWorkflowStore.setUploadResult({uploadId:'upload-active',status:'UPLOADED'});scanWorkflowStore.cancelCurrentDocument();expect(scanWorkflowStore.get()).toEqual(expect.objectContaining({acquisitionMode:'IDLE',acquisitionStatus:'IDLE',pageCount:0,pages:[],cleanPdfReady:false}));expect(scanWorkflowStore.get().sessionId).toBeUndefined();expect(scanWorkflowStore.get().uploadId).toBeUndefined()});
  it('invalida la sesión anterior inmediatamente después de cancelar',()=>{scanWorkflowStore.beginAcquisition('CZUR','session-stale');scanWorkflowStore.cancelCurrentDocument();expect(scanWorkflowStore.get().acquisitionMode).toBe('IDLE');expect(scanWorkflowStore.get().acquisitionSessionId).toBeUndefined()});
});
