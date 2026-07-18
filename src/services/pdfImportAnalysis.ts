import {createWorker,PSM} from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import spaDataUrl from '@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz?url';
import type {PdfDocumentEvidence} from '../domain/document-domain';
import {classifyLegalAct,extractNotarialFields,extractSpatialHistoricalFields,type SpatialOcrWord} from './ocrExtraction';

pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;

export async function readPdfEvidence(file:File,onProgress?:(page:number,total:number,mode:'TEXT'|'OCR')=>void):Promise<PdfDocumentEvidence>{
  const analyzedAt=new Date().toISOString();
  try{
    if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('El archivo seleccionado no es PDF.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(new TextDecoder('latin1').decode(bytes.slice(0,5))!=='%PDF-')throw new Error('La cabecera del archivo no corresponde a un PDF válido.');
    const pdfDocument=await pdfjs.getDocument({data:bytes}).promise;
    if(!pdfDocument.numPages)throw new Error('El PDF no contiene páginas.');
    const textPages:string[]=[];
    for(let pageNumber=1;pageNumber<=pdfDocument.numPages;pageNumber++){
      onProgress?.(pageNumber,pdfDocument.numPages,'TEXT');
      const page=await pdfDocument.getPage(pageNumber);const content=await page.getTextContent();
      textPages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));
    }
    let fullText=textPages.join('\n');let usedOcr=false;let averageConfidence: number|undefined;
    const meaningfulCharacters=fullText.replace(/\s/g,'').length;
    if(meaningfulCharacters<Math.max(80,pdfDocument.numPages*25)){
      usedOcr=true;const langPath=spaDataUrl.slice(0,spaDataUrl.lastIndexOf('/'));
      const worker=await createWorker('spa',undefined,{langPath});const chunks:string[]=[];const confidences:number[]=[];const spatialWords:SpatialOcrWord[]=[];
      try{
        for(let pageNumber=1;pageNumber<=pdfDocument.numPages;pageNumber++){
          onProgress?.(pageNumber,pdfDocument.numPages,'OCR');
          const page=await pdfDocument.getPage(pageNumber);const viewport=page.getViewport({scale:3});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          const context=canvas.getContext('2d');if(!context)throw new Error('El navegador no pudo preparar una página para OCR.');context.filter='grayscale(1) contrast(1.35)';
          await page.render({canvas,canvasContext:context,viewport}).promise;const recognized=await worker.recognize(canvas,{}, {blocks:true,text:true});
          chunks.push(recognized.data.text);confidences.push(recognized.data.confidence);
          for(const block of recognized.data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines)for(const word of line.words)spatialWords.push({text:word.text,confidence:word.confidence,pageNumber,x0:word.bbox.x0,y0:word.bbox.y0,x1:word.bbox.x1,y1:word.bbox.y1});
          if(pageNumber===1){const binary=document.createElement('canvas');binary.width=canvas.width;binary.height=canvas.height;const binaryContext=binary.getContext('2d');if(binaryContext){binaryContext.drawImage(canvas,0,0);const pixels=binaryContext.getImageData(0,0,binary.width,binary.height);for(let offset=0;offset<pixels.data.length;offset+=4){const gray=(pixels.data[offset]+pixels.data[offset+1]+pixels.data[offset+2])/3,value=gray<205?0:255;pixels.data[offset]=value;pixels.data[offset+1]=value;pixels.data[offset+2]=value}binaryContext.putImageData(pixels,0,0);await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ.°º:-0123456789 '});const second=await worker.recognize(binary,{}, {blocks:true,text:true});chunks.push(second.data.text);confidences.push(second.data.confidence);for(const block of second.data.blocks??[])for(const paragraph of block.paragraphs)for(const line of paragraph.lines)for(const word of line.words)spatialWords.push({text:word.text,confidence:word.confidence,pageNumber,x0:word.bbox.x0,y0:word.bbox.y0,x1:word.bbox.x1,y1:word.bbox.y1});await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO,tessedit_char_whitelist:''})}binary.width=1;binary.height=1}
          canvas.width=1;canvas.height=1;
        }
      }finally{await worker.terminate()}
      const spatial=extractSpatialHistoricalFields(spatialWords);fullText=`${chunks.join('\n')}\nMARCAS_LATERALES\n${spatial.kardexNumber?`K. ${spatial.kardexNumber}`:''}\n${spatial.instrumentNumber?`E. ${spatial.instrumentNumber}`:''}\n${spatial.minuteNumber?`M. ${spatial.minuteNumber}`:''}\n${spatial.printedFolio?`FOJA ${spatial.printedFolio}`:''}\n${spatial.unclassifiedAv?`A.V. ${spatial.unclassifiedAv}`:''}`;averageConfidence=confidences.length?Math.round(confidences.reduce((sum,value)=>sum+value,0)/confidences.length):0;
    }
    const extracted=extractNotarialFields(fullText);const fields:PdfDocumentEvidence['fields']={};
    for(const item of extracted)if(item.normalizedValue)fields[item.fieldName as keyof PdfDocumentEvidence['fields']]=item.normalizedValue;
    const legalAct=classifyLegalAct(fullText).suggested??undefined;
    return{analysisVersion:6,status:usedOcr?'OCR_COMPLETED':'TEXT_EXTRACTED',pageCount:pdfDocument.numPages,textCharacters:fullText.replace(/\s/g,'').length,usedOcr,analyzedAt,fields,legalAct,averageConfidence};
  }catch(error){return{analysisVersion:6,status:'ERROR',pageCount:0,textCharacters:0,usedOcr:false,analyzedAt,fields:{},error:error instanceof Error?error.message:'No se pudo leer el PDF.'}}
}
