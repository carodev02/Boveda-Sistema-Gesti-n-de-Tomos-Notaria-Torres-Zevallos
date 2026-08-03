import {describe,expect,it} from 'vitest';
import {preferredKardexTome,type ReconciliationRow} from '../src/services/kardex-tome-reconciliation.service';

const row=(values:Partial<ReconciliationRow>):ReconciliationRow=>({id:'1',kardex:'10131',documentType:'Minuta',year:2026,bienniumStart:null,bienniumEnd:null,tomo:'1',actoJuridico:null,kardexCaseId:null,contractors:[],...values});
describe('reconciliación de tomos por Kardex',()=>{
 it('usa el tomo del documento protocolar para reunir la Minuta y el Acta',()=>expect(preferredKardexTome([row({}),row({id:'2',documentType:'Acta',tomo:'23'})])).toBe('23'));
 it('usa un tomo existente cuando solo hay Minutas',()=>expect(preferredKardexTome([row({tomo:'80'})])).toBe('80'));
});
