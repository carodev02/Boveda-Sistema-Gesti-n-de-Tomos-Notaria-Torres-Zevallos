import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('nombre propuesto al descargar',()=>{
  it('guarda el nombre confirmado y lo envía como nombre de descarga',()=>{
    const controller=readFileSync(new URL('../src/controllers/documents.controller.ts',import.meta.url),'utf8');
    expect(controller).toContain('const displayName=sanitizeDisplayText(input.displayName??originalFileName)||originalFileName');
    expect(controller).toContain("inlineContentDisposition(row.displayName)");
  });

  it('descarga desde un enlace conectado usando el nombre registrado',()=>{
    const viewer=readFileSync(new URL('../../src/pages/Visor.tsx',import.meta.url),'utf8');
    expect(viewer).toContain("window.document.body.appendChild(link)");
    expect(viewer).toContain("link.download=current.fileName");
    expect(viewer).toContain("link.remove()");
    expect(viewer).toContain("#toolbar=0&navpanes=0");
  });
});
