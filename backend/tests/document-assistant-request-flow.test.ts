import {describe,expect,it} from 'vitest';
import {answerDocumentQuestion} from '../../src/services/documentAssistant';
import type {DocumentRecord} from '../../src/data/repository';

const document=(id:number,tipo:string):DocumentRecord=>({
 id,
 backendId:`00000000-0000-4000-8000-${String(id).padStart(12,'0')}`,
 documentMode:'actual',
 tipo,
 ano:2000,
 tomo:'1',
 numeroMinuta:'',
 actoJuridico:'Compraventa',
 kardex:'300',
 normalizedKardex:'300',
 escritura:String(id),
 contratantes:['PERSONA'],
 observaciones:'',
 fecha:'',
 fechaRegistro:'2026-01-01',
 cantidadPaginas:1,
 documento:'CONFIRMED',
 ocr:'PROCESSED',
 fileName:`documento-${id}.pdf`,
 fileSize:1,
 file:new Blob([],{type:'application/pdf'}),
 source:'manual'
});

describe('asistente con Solicitud y Registro Notarial',()=>{
 const documents=[document(1,'Solicitud'),document(2,'Registro Notarial')];

 it('no informa que falta minuta cuando existe Solicitud',()=>{
  expect(answerDocumentQuestion('dime cuales estan sin minuta',documents).results).toHaveLength(0);
 });

 it('no informa que falta registro cuando Solicitud y Registro Notarial están relacionados',()=>{
  expect(answerDocumentQuestion('que kardex faltan con actas',documents).results).toHaveLength(0);
 });
});
