export function downloadText(filename:string,content:string,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url)}
export function csvCell(value:unknown){return `"${String(value??'').replaceAll('"','""')}"`}
export function readJson<T>(key:string,fallback:T):T{try{const value=localStorage.getItem(key);return value?JSON.parse(value) as T:fallback}catch{return fallback}}
export function writeJson<T>(key:string,value:T){localStorage.setItem(key,JSON.stringify(value))}

