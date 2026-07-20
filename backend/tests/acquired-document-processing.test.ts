import {afterEach,describe,expect,it,vi} from 'vitest';
import {processAcquiredDocument} from '../../src/services/acquiredDocumentProcessing';

afterEach(()=>vi.unstubAllGlobals());
const pdf=()=>new Blob([new TextEncoder().encode('%PDF-1.4\n%%EOF')],{type:'application/pdf'});

describe('pipeline único de adquisición',()=>{
 it.each(['MANUAL','CZUR'] as const)('sube e inicia OCR para %s',async sourceType=>{
  const responses=[{uploadId:'upload-1',status:'UPLOADED',pageCount:2},{jobId:'job-1',status:'OCR_PROCESSING'}];
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify(responses.shift()),{status:200,headers:{'Content-Type':'application/json'}}));vi.stubGlobal('fetch',fetchMock);
  const result=await processAcquiredDocument({sourceType,sessionId:sourceType==='CZUR'?'session-1':undefined,state:{},metadata:{file:pdf(),documentClass:'MINUTA'}});
  expect(result.job.jobId).toBe('job-1');expect(fetchMock).toHaveBeenCalledTimes(2);
 });
 it('reanuda un job existente sin volver a subir ni iniciar OCR',async()=>{const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);const result=await processAcquiredDocument({sourceType:'MANUAL',state:{uploadId:'upload-1',ocrJobId:'job-1'},metadata:{file:pdf(),documentClass:'MINUTA'}});expect(result.job.jobId).toBe('job-1');expect(fetchMock).not.toHaveBeenCalled()});
});
