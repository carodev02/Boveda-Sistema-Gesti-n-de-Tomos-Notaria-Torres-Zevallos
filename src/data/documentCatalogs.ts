import type {LegalAct,RegistryType} from '../domain/document-domain';

export const legalActs:LegalAct[]=[
  {id:'compraventa',name:'Compraventa',active:true},
  {id:'poder-especial',name:'Poder especial',active:true},
  {id:'donacion',name:'Donación',active:true},
  {id:'constitucion-empresa',name:'Constitución de empresa',active:true},
  {id:'hipoteca',name:'Hipoteca',active:true},
  {id:'testamento',name:'Testamento',active:true},
  {id:'otros',name:'Otros',active:true},
];

export const registryTypes:RegistryType[]=[
  {id:'escrituras-publicas',name:'Escrituras públicas',active:true,tomeRequired:true},
  {id:'poderes',name:'Poderes',active:true,tomeRequired:true},
  {id:'testamentos',name:'Testamentos',active:true,tomeRequired:true},
  {id:'actas',name:'Acta Vehicular',active:true,tomeRequired:true},
  {id:'solicitud-nc',name:'Solicitud-N.C',active:true,tomeRequired:true},
  {id:'otros-registros',name:'Otros registros notariales',active:true,tomeRequired:false},
];

function configuredActs(){try{const saved=JSON.parse(localStorage.getItem('sigadn-settings')??'{}') as {legalActs?:string};const names=saved.legalActs?.split(',').map(name=>name.trim()).filter(Boolean);return names?.length?names.map((name,index)=>({id:legalActs[index]?.id??`custom-${index}`,name,active:true})):legalActs}catch{return legalActs}}
export function activeLegalActs(){return configuredActs().filter(item=>item.active)}
export function activeRegistryTypes(){let configured:RegistryType[]=[];try{const saved=JSON.parse(localStorage.getItem('sigadn-settings')??'{}') as {documentTypes?:string};configured=(saved.documentTypes?.split(',').map(name=>name.trim()).filter(Boolean)??[]).map((name,index)=>({id:`configured-type-${index}`,name,active:true,tomeRequired:true}))}catch{/* Se conservan los tipos base. */}return [...registryTypes.filter(item=>item.active),...configured]}
export function registryTypeById(id:string){return activeRegistryTypes().find(item=>item.id===id)}
