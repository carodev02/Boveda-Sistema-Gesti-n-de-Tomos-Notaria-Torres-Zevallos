import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const worker=readFileSync(new URL('../src/services/ocr-worker.service.ts',import.meta.url),'utf8');
const processor=readFileSync(new URL('../../src-tauri/vision/processor.py',import.meta.url),'utf8');

describe('protocolo OCR para PDF grandes',()=>{
  it('guarda el resultado completo fuera del stdout limitado',()=>{
    expect(worker).toContain("'--output',resultPath");
    expect(worker).toContain("fs.readFile(resultPath,'utf8')");
    expect(worker).not.toContain('slice(-10_000_000)');
    expect(processor).toContain('args.output.write_text(serialized, encoding="utf-8")');
  });

  it('valida la cabecera sin cargar el PDF completo en memoria',()=>{
    expect(processor).toContain('handle.read(4) == b"%PDF"');
    expect(processor).not.toContain('source.read_bytes()[:4]');
  });

  it('estima el tiempo usando solo las páginas OCR medidas',()=>{
    expect(processor).toContain('ocr_processed += 1');
    expect(processor).toContain('len(scanned_pages), ocr_started_at');
  });
});
