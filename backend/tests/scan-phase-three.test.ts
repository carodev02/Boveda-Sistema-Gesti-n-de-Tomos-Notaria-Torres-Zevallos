import {PDFDocument} from 'pdf-lib';
import {describe,expect,it} from 'vitest';
import {generateTemporaryCleanPdf,needsPdfRewrite,validNormalizedCorners} from '../../src/services/scanPdf';
import {isTauriEnvironment} from '../../src/utils/environment';

describe('Fase 3 en navegador',()=>{
  it('no identifica Node como Tauri',()=>expect(isTauriEnvironment()).toBe(false));
  it('valida únicamente coordenadas normalizadas y ordenadas',()=>{
    expect(validNormalizedCorners({topLeft:{x:.1,y:.1},topRight:{x:.9,y:.1},bottomRight:{x:.9,y:.9},bottomLeft:{x:.1,y:.9}})).toBe(true);
    expect(validNormalizedCorners({topLeft:{x:-1,y:0},topRight:{x:1,y:0},bottomRight:{x:1,y:1},bottomLeft:{x:0,y:1}})).toBe(false);
  });
  it('genera una copia limpia respetando orden, rotación y exclusiones',async()=>{
    const source=await PDFDocument.create();source.addPage([200,300]);source.addPage([300,200]);const input=await source.save();
    const clean=await generateTemporaryCleanPdf(new Blob([Uint8Array.from(input)]),[{originalPageNumber:2,rotation:90,excluded:false},{originalPageNumber:1,rotation:0,excluded:true}]);
    const output=await PDFDocument.load(clean);expect(output.getPageCount()).toBe(1);expect(output.getPage(0).getRotation().angle).toBe(90);
  });
  it('evita reconstruir un PDF cuando las páginas no fueron modificadas',()=>{
    expect(needsPdfRewrite([{originalPageNumber:1,rotation:0,excluded:false},{originalPageNumber:2,rotation:0,excluded:false}])).toBe(false);
    expect(needsPdfRewrite([{originalPageNumber:1,rotation:90,excluded:false}])).toBe(true);
    expect(needsPdfRewrite([{originalPageNumber:1,rotation:0,excluded:true}])).toBe(true);
    expect(needsPdfRewrite([{originalPageNumber:2,rotation:0,excluded:false},{originalPageNumber:1,rotation:0,excluded:false}])).toBe(true);
  });
});
