import type {NextFunction,Request,Response} from 'express';

export class HttpError extends Error{
  constructor(public status:number,message:string,public details?:unknown){super(message)}
}

export function asyncHandler(handler:(req:Request,res:Response,next:NextFunction)=>Promise<unknown>){
  return (req:Request,res:Response,next:NextFunction)=>{void handler(req,res,next).catch(next)};
}

export function clientIp(req:Request){return req.ip||req.socket.remoteAddress||'desconocida'}
