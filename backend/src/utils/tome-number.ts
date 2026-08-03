import {HttpError} from './http.js';

export function requiredTomeNumber(value:unknown){const text=String(value??'').trim();if(!text)throw new HttpError(400,'El número de tomo es obligatorio.');if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)<=0)throw new HttpError(400,'Ingrese un número de tomo válido.');return String(Number(text))}
