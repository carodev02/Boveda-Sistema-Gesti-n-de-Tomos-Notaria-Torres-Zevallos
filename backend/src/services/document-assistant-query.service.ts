const ignoredTerms=new Set([
  'a','al','algo','ano','anos','archivo','archivos','buscar','busca','con','cual','cuales','cuanto','cuantos',
  'contenido','dame','de','del','dice','dime','documento','documentos','donde','el','en','encuentra','encontrar','esta','este',
  'escritura','escrituras','hay','informacion','kardex','la','las','lo','los','me','minuta','minutas','muestra','muestrame','nombre','numero','ocr','palabra','para','pdf','por','que','quiero','sobre',
  'texto','tiene','tienen','todas','todos','tomo','tomos','un','una','uno','ver'
]);

export const normalizeAssistantText=(value:unknown)=>String(value??'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-PE')
  .replace(/\s+/g,' ')
  .trim();

export function assistantConversationAnswer(question:string){
  const normalized=normalizeAssistantText(question).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  if(/^(hola|buenos dias|buenas tardes|buenas noches|buenas)( como estas| que tal)?$/.test(normalized)){
    return '¡Hola! Puedo ayudarte a localizar archivos y consultar datos registrados en Bóveda. Indícame un nombre de archivo, kardex, escritura, tomo, persona o término del PDF.';
  }
  if(/^(gracias|muchas gracias|ok|okay|perfecto|entendido)$/.test(normalized))return 'Con gusto. Cuando quieras, indícame qué archivo o dato documental necesitas.';
  if(/^(adios|hasta luego|nos vemos|chau)$/.test(normalized))return 'Hasta luego. Aquí estaré cuando necesites consultar los documentos de Bóveda.';
  return undefined;
}

export function assistantSearchTerms(question:string){
  return [...new Set(normalizeAssistantText(question)
    .split(/[^a-z0-9ñ-]+/)
    .filter(term=>term.length>1&&!ignoredTerms.has(term)))]
    .slice(0,12);
}

export function containsEveryAssistantTerm(searchable:string,terms:string[]){
  const normalized=normalizeAssistantText(searchable);
  return terms.length>0&&terms.every(term=>normalized.includes(term));
}
