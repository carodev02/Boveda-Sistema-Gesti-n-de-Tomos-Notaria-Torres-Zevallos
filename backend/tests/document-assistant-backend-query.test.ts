import {describe,expect,it} from 'vitest';
import {assistantConversationAnswer,assistantSearchTerms,containsEveryAssistantTerm} from '../src/services/document-assistant-query.service';

describe('consulta OCR del asistente',()=>{
 it('reconoce conversación breve antes de buscar documentos',()=>{
  expect(assistantConversationAnswer('Hola')).toContain('¡Hola!');
  expect(assistantConversationAnswer('Muchas gracias')).toContain('Con gusto');
 });

 it('extrae solo términos útiles de una solicitud documental',()=>{
  expect(assistantSearchTerms('Busca en los documentos a Juan Pérez')).toEqual(['juan','perez']);
  expect(assistantSearchTerms('¿Qué dice el texto OCR sobre Juan Pérez?')).toEqual(['juan','perez']);
 });

 it('exige todos los términos para evitar listas por coincidencias parciales',()=>{
  const terms=assistantSearchTerms('Busca a Juan Pérez');
  expect(containsEveryAssistantTerm('Escritura de Juan Pérez',terms)).toBe(true);
  expect(containsEveryAssistantTerm('Escritura de Juan García',terms)).toBe(false);
 });
});
