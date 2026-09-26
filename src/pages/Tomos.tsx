import {useEffect,useMemo,useRef,useState} from 'react';
import {BookOpen,CalendarDays,ChevronDown,ChevronRight,FileKey2,FileText,FileType2,Pencil,X} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import {useDocuments} from '../hooks/useDocuments';
import {updateDocumentTypeGroup,updateTomeNumber} from '../services/documentsApi';
import {buildTomeHierarchy,type TomePeriodScope} from '../services/tomeHierarchy';
import './tomos.css';
import './tomos-edit.css';

const OPEN_KEY='sigadn-tomos-open-v1';
const SCROLL_KEY='sigadn-tomos-scroll-v1';

type TomeEdit={period:TomePeriodScope;current:string;next:string};
type TypeEdit={period:TomePeriodScope;tome:string;current:string;next:string};

function initialOpen(){
 try{return JSON.parse(sessionStorage.getItem(OPEN_KEY)??'{}') as Record<string,boolean>}
 catch{return {}}
}

export function Tomos(){
 const navigate=useNavigate();
 const {user}=useAuth();
 const canManageStructure=user?.role==='Administrador'||user?.role==='Notario';
 const {documents,loading,error,refresh}=useDocuments();
 const [open,setOpen]=useState<Record<string,boolean>>(initialOpen);
 const [editing,setEditing]=useState<TomeEdit>();
 const [typeEditing,setTypeEditing]=useState<TypeEdit>();
 const [saving,setSaving]=useState(false);
 const savingRef=useRef(false);
 const [editError,setEditError]=useState('');
 const groups=useMemo(()=>buildTomeHierarchy(documents),[documents]);
 const totalTomos=groups.reduce((sum,group)=>sum+group.tomes.length,0);
 const totalDocuments=groups.reduce((sum,group)=>sum+group.tomes.reduce((subtotal,tome)=>subtotal+tome.kardexCases.reduce((caseTotal,kardex)=>caseTotal+kardex.categories.reduce((count,item)=>count+item.documents.length,0),0),0),0);

 useEffect(()=>{
  if(loading)return;
  const top=Number(sessionStorage.getItem(SCROLL_KEY)??0);
  if(top)requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top})));
 },[loading,groups.length]);

 function toggle(key:string,expanded:boolean){
  setOpen(current=>{
   const next={...current,[key]:!expanded};
   sessionStorage.setItem(OPEN_KEY,JSON.stringify(next));
   return next;
  });
 }

 function view(id:number|string){
  sessionStorage.setItem(OPEN_KEY,JSON.stringify(open));
  sessionStorage.setItem(SCROLL_KEY,String(window.scrollY));
  navigate(`/visor/${id}`,{state:{from:'/tomos'}});
 }

 function editTome(period:TomePeriodScope,current:string){
  setTypeEditing(undefined);
  setEditing({period,current,next:current});
  setEditError('');
 }

 function editType(period:TomePeriodScope,tome:string,current:string){
  setEditing(undefined);
  setTypeEditing({period,tome,current,next:current});
  setEditError('');
 }

 function closeEditor(){
  if(saving)return;
  setEditing(undefined);
  setTypeEditing(undefined);
  setEditError('');
 }

 async function saveTome(){
  if(!editing||savingRef.current)return;
  const next=editing.next.trim();
  if(!next){setEditError('Ingrese el nuevo número de tomo.');return}
  if(next===editing.current){closeEditor();return}
  savingRef.current=true;
  setSaving(true);
  setEditError('');
  try{
   await updateTomeNumber(editing.period,editing.current,next);
   setEditing(undefined);
   await refresh();
  }catch(cause){
   setEditError(cause instanceof Error?cause.message:'No se pudo actualizar el tomo.');
  }finally{
   savingRef.current=false;
   setSaving(false);
  }
 }

 async function saveType(){
  if(!typeEditing||savingRef.current)return;
  const next=typeEditing.next.trim();
  if(!next){setEditError('Ingrese el nuevo tipo documental.');return}
  if(next===typeEditing.current){closeEditor();return}
  savingRef.current=true;
  setSaving(true);
  setEditError('');
  try{
   await updateDocumentTypeGroup(typeEditing.period,typeEditing.tome,typeEditing.current,next);
   setTypeEditing(undefined);
   await refresh();
  }catch(cause){
   setEditError(cause instanceof Error?cause.message:'No se pudo actualizar el tipo documental.');
  }finally{
   savingRef.current=false;
   setSaving(false);
  }
 }

 return <div className="page-content tomosPage">
  <div className="tomosLead"><span>{totalTomos} {totalTomos===1?'tomo registrado':'tomos registrados'}</span></div>
  <div className="tomoStats">
   <Mini icon={<CalendarDays/>} n={String(groups.length)} label="Años y bienios"/>
   <Mini icon={<BookOpen/>} n={String(totalTomos)} label="Total tomos"/>
   <Mini icon={<FileText/>} n={String(totalDocuments)} label="Documentos"/>
  </div>
  <section className="card yearList">
   {loading?<div className="emptyTomo">Cargando organización documental…</div>:error?<div className="emptyTomo"><p>No se pudo cargar la organización documental.</p><button className="btn" onClick={()=>void refresh()}>Reintentar</button></div>:groups.map(group=><TreeNode key={group.key} nodeKey={group.key} open={open} toggle={toggle} icon={<CalendarDays/>} title={group.label} subtitle={`${group.tomes.length} ${group.tomes.length===1?'tomo':'tomos'}`} level="year">
    {group.tomes.map(tome=>{
     const editablePeriod=canManageStructure?group.scope:undefined;
     const documentCount=tome.kardexCases.reduce((sum,kardex)=>sum+kardex.categories.reduce((count,item)=>count+item.documents.length,0),0);
     return <TreeNode key={tome.key} nodeKey={tome.key} open={open} toggle={toggle} icon={<BookOpen/>} title={tome.label} subtitle={`${tome.kardexCases.length} ${tome.kardexCases.length===1?'Kardex':'Kardex'} · ${documentCount} ${documentCount===1?'documento':'documentos'}`} level="tome" onEdit={editablePeriod&&tome.value!=='unknown'?()=>editTome(editablePeriod,tome.value):undefined} editTitle="Editar número de tomo">
      {tome.kardexCases.map(kardex=><TreeNode key={kardex.key} nodeKey={kardex.key} open={open} toggle={toggle} icon={<FileKey2/>} title={kardex.label} subtitle={kardex.status} level="kardex">
       {kardex.categories.map(item=>{
        const key=`${kardex.key}/category:${item.name}`;
        const editableType=item.sourceTypes.length===1?item.sourceTypes[0]:undefined;
        return <TreeNode key={key} nodeKey={key} open={open} toggle={toggle} icon={<FileType2/>} title={item.name} subtitle={`${item.documents.length} ${item.documents.length===1?'documento':'documentos'}`} level="category" onEdit={editablePeriod&&tome.value!=='unknown'&&editableType?()=>editType(editablePeriod,tome.value,editableType):undefined} editTitle="Editar tipo documental">
         {item.documents.map(({document,label,exactFolio,requiresReview})=><button className="tomePdf" key={document.backendId??document.id} onClick={()=>view(document.backendId??document.id)}><FileText/><span>{label}</span>{exactFolio!=null&&<small className="exactFolio">Foja {exactFolio}</small>}{requiresReview&&<small>Requiere revisión</small>}</button>)}
        </TreeNode>;
       })}
      </TreeNode>)}
     </TreeNode>;
    })}
   </TreeNode>)}
   {!loading&&!error&&!groups.length&&<div className="emptyTomo">No hay documentos confirmados organizados en tomos todavía.</div>}
  </section>
  {editing&&<EditModal title="Editar número de tomo" currentLabel="Número de tomo actual" nextLabel="Nuevo número de tomo" current={editing.current} next={editing.next} saving={saving} error={editError} onChange={next=>{setEditing({...editing,next});setEditError('')}} onClose={closeEditor} onSave={saveTome}/>}
  {typeEditing&&<EditModal title="Editar tipo documental" currentLabel="Tipo documental actual" nextLabel="Nuevo tipo documental" current={typeEditing.current} next={typeEditing.next} saving={saving} error={editError} onChange={next=>{setTypeEditing({...typeEditing,next});setEditError('')}} onClose={closeEditor} onSave={saveType}/>}
 </div>;
}

function EditModal({title,currentLabel,nextLabel,current,next,saving,error,onChange,onClose,onSave}:{title:string;currentLabel:string;nextLabel:string;current:string;next:string;saving:boolean;error:string;onChange:(value:string)=>void;onClose:()=>void;onSave:()=>Promise<void>}){
 const titleId=title==='Editar número de tomo'?'edit-tome-title':'edit-type-title';
 return <div className="tomeModalBackdrop" role="presentation" onClick={onClose}>
  <section className="card tomeEditModal" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={event=>event.stopPropagation()}>
   <header><h2 id={titleId}>{title}</h2><button type="button" aria-label="Cerrar" disabled={saving} onClick={onClose}><X/></button></header>
   <label>{currentLabel}<input className="field" value={current} readOnly/></label>
   <label>{nextLabel}<input className="field" autoFocus value={next} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void onSave()}}/></label>
   {error&&<p className="tomeEditError" role="alert">{error}</p>}
   <footer><button className="btn" disabled={saving} onClick={onClose}>Cancelar</button><button className="btn primary" disabled={saving||!next.trim()} onClick={()=>void onSave()}>{saving?'Guardando…':'Guardar'}</button></footer>
  </section>
 </div>;
}

function TreeNode({nodeKey,open,toggle,icon,title,subtitle,level,onEdit,editTitle,children}:{nodeKey:string;open:Record<string,boolean>;toggle:(key:string,expanded:boolean)=>void;icon:React.ReactNode;title:string;subtitle:string;level:'year'|'tome'|'kardex'|'category';onEdit?:()=>void;editTitle?:string;children:React.ReactNode}){
 const expanded=open[nodeKey]??level==='year';
 return <div className={`tomeTreeNode ${level} ${expanded?'expanded':''}`}>
  <button className="tomeTreeHead" onClick={()=>toggle(nodeKey,expanded)}>{expanded?<ChevronDown/>:<ChevronRight/>}<span className="icon-disc">{icon}</span><span className="tomeTreeLabel"><b>{title}</b><small>{subtitle}</small></span></button>
  {onEdit&&<button className="tomeEditButton" title={editTitle} aria-label={`${editTitle}: ${title}`} onClick={onEdit}><Pencil/></button>}
  {expanded&&<div className="tomeTreeChildren">{children}</div>}
 </div>;
}

function Mini({icon,n,label}:{icon:React.ReactNode;n:string;label:string}){
 return <div className="card tomoStat"><div className="icon-disc">{icon}</div><div><strong>{n}</strong><small>{label}</small></div></div>;
}
