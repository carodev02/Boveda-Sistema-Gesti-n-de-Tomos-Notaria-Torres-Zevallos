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
  {id:'otros-registros',name:'Otros registros notariales',active:true,tomeRequired:false},
];

export function activeLegalActs(){return legalActs.filter(item=>item.active)}
export function activeRegistryTypes(){return registryTypes.filter(item=>item.active)}
export function registryTypeById(id:string){return registryTypes.find(item=>item.id===id)}
