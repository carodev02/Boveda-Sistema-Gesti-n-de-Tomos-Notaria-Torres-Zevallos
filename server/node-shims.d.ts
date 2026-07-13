declare module 'node:http'{export interface IncomingMessage{headers:Record<string,string|string[]|undefined>;url?:string;method?:string;socket:{remoteAddress?:string};on(event:string,listener:(chunk?:unknown)=>void):void}export interface ServerResponse{statusCode:number;setHeader(name:string,value:string):void;end(value?:string):void}}
declare module 'node:fs'{export function existsSync(path:string):boolean;export function mkdirSync(path:string,options:{recursive:boolean}):void;export function readFileSync(path:string,encoding:string):string;export function writeFileSync(path:string,data:string,encoding:string):void}
declare module 'node:path'{export function dirname(path:string):string;export function resolve(...paths:string[]):string}
declare const process:{cwd():string};
