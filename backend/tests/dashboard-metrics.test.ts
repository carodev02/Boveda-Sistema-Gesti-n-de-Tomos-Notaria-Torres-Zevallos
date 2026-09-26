import {describe,expect,it} from 'vitest';
import {hasProcessingError,lacksOcrProcessing,needsDocumentReview,wasRegisteredToday} from '../../src/utils/dashboardMetrics';

describe('métricas operativas del Dashboard',()=>{
 it('reconoce estados reales del servidor',()=>{
  expect(needsDocumentReview({documento:'CONFIRMED',ocr:'REVIEW_REQUIRED'})).toBe(true);
  expect(lacksOcrProcessing({ocr:'OCR_PENDING'})).toBe(true);
  expect(hasProcessingError({ocr:'FAILED'})).toBe(true);
 });
 it('cuenta por la fecha real de registro',()=>{
  expect(wasRegisteredToday('2026-08-12T15:30:00-05:00',new Date('2026-08-12T18:00:00-05:00'))).toBe(true);
  expect(wasRegisteredToday('2026-08-11T15:30:00-05:00',new Date('2026-08-12T18:00:00-05:00'))).toBe(false);
 });
});
