import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
describe('mensajes de restricciones únicas',()=>{it('no presenta un hash de PDF como correo duplicado',()=>{const source=readFileSync(new URL('../src/middlewares/error.middleware.ts',import.meta.url),'utf8');expect(source).toContain("/fileHash/i.test(target)?'Este PDF ya está registrado.'");expect(source).toContain("/username/i.test(target)?'El nombre de usuario ya está registrado.'")})});
