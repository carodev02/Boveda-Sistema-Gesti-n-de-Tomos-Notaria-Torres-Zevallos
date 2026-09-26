import {describe,expect,it} from 'vitest';
import {dashboardDocumentTypeCounts} from '../../src/utils/dashboardMetrics';

describe('tipos documentales del Dashboard',()=>{
 it('agrupa variantes equivalentes de Escrituras públicas',()=>{
  expect(dashboardDocumentTypeCounts([{tipo:'Escrituras públicas'},{tipo:'  Escrituras   públicas  '},{tipo:'ESCRITURAS PUBLICAS'}])).toEqual([['Escrituras públicas',3]]);
 });
});
