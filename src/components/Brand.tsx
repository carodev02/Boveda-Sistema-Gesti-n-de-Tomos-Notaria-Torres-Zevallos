import logo from '../assets/branding/logo-notaria-torres-zevallos.png';

export function Brand({light=false}:{light?:boolean}){return <div className="brand"><img className="brandLogo" src={logo} alt="Logo de la Notaría Torres Zevallos"/>{!light&&<div><b>Boveda</b><small>Notaría Torres Zevallos</small></div>}</div>}

