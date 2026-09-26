import {apiRequest,ApiError} from './apiClient';

export type OcrAssistantMatch={documentId:string;snippet:string;pageNumber?:number};

export async function searchDocumentOcr(question:string){
 try{return await apiRequest<{answer:string;matches:OcrAssistantMatch[]}>('/assistant/query',{method:'POST',body:JSON.stringify({question})})}
 catch(error){if(error instanceof ApiError&&error.status===404)return undefined;throw error}
}
