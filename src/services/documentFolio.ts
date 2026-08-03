import type {DocumentRecord} from '../data/repository';
export function documentTableFolio(document:Pick<DocumentRecord,'printedFolio'>){return document.printedFolio??'—'}
export function documentFolioDisplay(document:Pick<DocumentRecord,'folioRangeStart'|'folioRangeEnd'|'printedFolio'>){return {range:document.folioRangeStart!=null&&document.folioRangeEnd!=null?`${document.folioRangeStart}–${document.folioRangeEnd}`:'No registrado',exact:document.printedFolio!=null?String(document.printedFolio):'No detectada'}}
