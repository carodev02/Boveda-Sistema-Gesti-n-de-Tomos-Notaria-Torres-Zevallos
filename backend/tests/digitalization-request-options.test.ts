import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {activeRegistryTypes} from '../../src/data/documentCatalogs';

describe('opciones de Solicitud en digitalización',()=>{
 it('incluye Solicitud como clase documental principal',()=>{
  const domain=readFileSync(new URL('../../src/domain/document-domain.ts',import.meta.url),'utf8');
  const screen=readFileSync(new URL('../../src/pages/DigitalizacionProcess.tsx',import.meta.url),'utf8');
  expect(domain).toContain("'SOLICITUD'");
  expect(screen).toContain('<option value="SOLICITUD">Solicitud</option>');
  expect(screen).toContain('<RequestFields');
  expect(screen).toContain('label="Número de instrumento *" value={values.instrumentNumber}');
  expect(screen).toContain('<LegalActField value={values.legalActId}');
  expect(screen).toContain('if (config.documentClass === "SOLICITUD")required.push(review.instrumentNumber,review.legalActId)');
  expect(screen).toContain(': config.documentClass === "MINUTA" ? review.destinationInstrumentNumber : review.instrumentNumber');
 });

 it('incluye Solicitud-N.C dentro de Registro notarial',()=>{
  expect(activeRegistryTypes()).toContainEqual(expect.objectContaining({id:'solicitud-nc',name:'Solicitud-N.C',active:true}));
 });
});
