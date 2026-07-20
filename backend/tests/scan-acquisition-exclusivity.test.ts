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
});
