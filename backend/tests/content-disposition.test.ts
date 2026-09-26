import {describe,expect,it} from 'vitest';
import {inlineContentDisposition} from '../src/utils/content-disposition.js';

describe('Content-Disposition de PDF',()=>{
  it('mantiene el encabezado en ASCII y codifica nombres con tildes',()=>{
    const header=inlineContentDisposition('Declaración pública – año 2026.pdf');
    expect(header).toContain('filename="Declaracion publica _ ano 2026.pdf"');
    expect(header).toContain("filename*=UTF-8''Declaraci%C3%B3n%20p%C3%BAblica%20%E2%80%93%20a%C3%B1o%202026.pdf");
    expect(Buffer.from(header,'ascii').toString('ascii')).toBe(header);
  });

  it('elimina saltos de línea y comillas del nombre alternativo',()=>{
    const header=inlineContentDisposition('acta\r\n"especial".pdf');
    expect(header).toContain('filename="acta  _especial_.pdf"');
    expect(header).not.toMatch(/[\r\n]/);
  });
});
