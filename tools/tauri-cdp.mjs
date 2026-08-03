import {writeFile} from 'node:fs/promises';

const [mode='snapshot',...args]=process.argv.slice(2);
const targets=await fetch('http://127.0.0.1:9222/json').then(response=>response.json());
const target=targets.find(item=>item.type==='page');
if(!target)throw new Error('No hay una ventana WebView disponible.');
const socket=new WebSocket(target.webSocketDebuggerUrl);let sequence=0;const pending=new Map();
socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){const {resolve,reject}=pending.get(message.id);pending.delete(message.id);message.error?reject(new Error(message.error.message)):resolve(message.result)}});
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value}
if(mode==='snapshot')console.log(await evaluate(`JSON.stringify({url:location.href,title:document.title,text:document.body.innerText.slice(0,20000),buttons:[...document.querySelectorAll('button,a')].map((element,index)=>({index,text:(element.innerText||element.getAttribute('aria-label')||element.title||'').trim(),tag:element.tagName,href:element.getAttribute('href')})).filter(item=>item.text),fields:[...document.querySelectorAll('input,select,textarea')].map((element,index)=>({index,tag:element.tagName,type:element.type,value:element.value,placeholder:element.placeholder,aria:element.getAttribute('aria-label')}))})`));
else if(mode==='eval')console.log(JSON.stringify(await evaluate(args.join(' '))));
else if(mode==='screenshot'){const output=args[0]??'tauri-screen.png';const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true});await writeFile(output,Buffer.from(result.data,'base64'));console.log(output)}
else throw new Error(`Modo desconocido: ${mode}`);
socket.close();
