export function StatusBadge({children}:{children:string}){const value=children.toLowerCase();const kind=value.includes('valid')||value==='procesado'||value==='exitoso'?'success':value.includes('revisión')||value.includes('baja')?'warning':value.includes('error')||value.includes('observado')?'danger':'neutral';return <span className={'badge '+kind}>{children}</span>}

