/// <reference lib="webworker" />
import {readExcelFile} from '../services/excelImport';

self.onmessage=async(event:MessageEvent<{file:File}>)=>{
  try{self.postMessage({ok:true,...await readExcelFile(event.data.file)})}
  catch(error){self.postMessage({ok:false,error:error instanceof Error?error.message:'No se pudo leer el Excel.'})}
};
