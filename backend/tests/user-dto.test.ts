import {describe,expect,it} from 'vitest';
import {publicUser} from '../src/utils/user-dto.js';

describe('publicUser',()=>{
  it('expone el indicador de cambio inicial sin filtrar datos sensibles',()=>{
    const source={id:'u1',username:'secretaria',email:'secretaria@notaria.pe',fullName:'Secretaria',phone:null,avatarUrl:null,role:'SECRETARIA',status:'ACTIVO',lastAccessAt:null,createdAt:new Date('2026-07-14T00:00:00Z'),passwordResetRequired:true,passwordHash:'no-debe-salir'};
    const result=publicUser(source);
    expect(result.passwordResetRequired).toBe(true);
    expect(result).not.toHaveProperty('passwordHash');
  });
});
