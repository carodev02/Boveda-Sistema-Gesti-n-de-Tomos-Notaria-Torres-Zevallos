import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const source=readFileSync(new URL('../../src/components/NotificationBell.tsx',import.meta.url),'utf8');

describe('campana de notificaciones flotante y fijable',()=>{
 it('permanece abierta al hacer clic',()=>{expect(source).toContain('const [pinned,setPinned]=useState(false)');expect(source).toContain('setPinned(true);show()');expect(source).toContain("if(!pinned)setOpen(false)")});
 it('se cierra al volver a pulsar o hacer clic fuera',()=>{expect(source).toContain('setPinned(false);setOpen(false)');expect(source).toContain("!root.current.contains(event.target as Node)")});
});
