import {useState} from 'react';
import {CheckCircle2,X} from 'lucide-react';
import {registrationApi,type RequestedRole} from '../services/registrationApi';
import './register-modal.css';

type Props={onClose:()=>void};
const initial={fullName:'',email:'',password:'',confirmPassword:'',requestedRole:'SECRETARIA' as RequestedRole};

export function RegisterModal({onClose}:Props){
  const [form,setForm]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  async function submit(event:React.FormEvent){
    event.preventDefault();setError('');
    if(form.fullName.trim().length<2){setError('Ingresa tu nombre completo.');return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setError('Ingresa un correo válido.');return}
    if(!/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,200}$/.test(form.password)){setError('La contraseña debe tener 8 caracteres, mayúscula, minúscula, número y símbolo.');return}
    if(form.password!==form.confirmPassword){setError('Las contraseñas no coinciden.');return}
    setBusy(true);
    try{const response=await registrationApi.create({...form,email:form.email.trim().toLowerCase()});setSuccess(response.message)}catch(cause){setError(cause instanceof Error?cause.message:'No fue posible crear la cuenta.')}finally{setBusy(false)}
  }

  return <div className="registrationBackdrop"><section className="card registrationModal" role="dialog" aria-modal="true" aria-labelledby="registration-title">
    <header><div><div className="eyebrow">SOLICITUD DE ACCESO</div><h2 id="registration-title">Crear cuenta</h2><p>La cuenta deberá ser aprobada antes de poder ingresar.</p></div><button type="button" onClick={onClose} aria-label="Cerrar"><X/></button></header>
    {success?<div className="registrationSuccess"><CheckCircle2/><h3>Solicitud registrada</h3><p>{success}</p><button className="btn primary" onClick={onClose}>Volver al inicio de sesión</button></div>:<form onSubmit={submit}>
      <div className="registrationFields"><label>NOMBRE COMPLETO<input className="field" required minLength={2} value={form.fullName} onChange={event=>setForm({...form,fullName:event.target.value})}/></label><label>CORREO<input className="field" required type="email" autoComplete="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})}/></label><label>ROL SOLICITADO<select className="field" value={form.requestedRole} onChange={event=>setForm({...form,requestedRole:event.target.value as RequestedRole})}><option value="ADMINISTRADOR">Administrador</option><option value="SECRETARIA">Secretaria</option><option value="ARCHIVADOR">Archivador</option></select></label><label>CONTRASEÑA<input className="field" required minLength={8} type="password" autoComplete="new-password" value={form.password} onChange={event=>setForm({...form,password:event.target.value})}/></label><label>CONFIRMAR CONTRASEÑA<input className="field" required minLength={8} type="password" autoComplete="new-password" value={form.confirmPassword} onChange={event=>setForm({...form,confirmPassword:event.target.value})}/></label></div>
      <p className="registrationHint">Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.</p>{error&&<div className="loginError" role="alert">{error}</div>}
      <footer><button type="button" className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy}>{busy?'Creando cuenta…':'Crear cuenta'}</button></footer>
    </form>}
  </section></div>;
}

