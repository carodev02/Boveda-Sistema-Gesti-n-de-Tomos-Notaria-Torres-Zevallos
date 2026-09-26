function encodeRfc5987(value:string){
  return encodeURIComponent(value).replace(/[!'()*]/g,char=>`%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function inlineContentDisposition(filename:string){
  const clean=filename.replace(/[\r\n]/g,' ').trim()||'documento.pdf';
  const fallback=clean.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'_').replace(/["\\]/g,'_').trim()||'documento.pdf';
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(clean)}`;
}
