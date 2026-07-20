const mojibake: ReadonlyArray<readonly [string,string]>=[
  ['â€”','—'],['â€“','–'],['â€˜','‘'],['â€™','’'],['â€œ','“'],['â€','”'],
  ['Ã±','ñ'],['Ã‘','Ñ'],['Ã¡','á'],['Ã©','é'],['Ã­','í'],['Ã³','ó'],['Ãº','ú'],
  ['Ã','Á'],['Ã‰','É'],['Ã','Í'],['Ã“','Ó'],['Ãš','Ú'],['Ã¼','ü'],['Ãœ','Ü'],
  ['Â°','°'],['Âº','º'],['Â·','·'],['Â',''],
];
// eslint-disable-next-line no-control-regex
const invalidControls=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
export function sanitizeDisplayText(value:unknown){let text=String(value??'').normalize('NFC');for(const [broken,valid] of mojibake)text=text.replaceAll(broken,valid);return text.replace(invalidControls,'').replace(/\uFFFD/g,'').normalize('NFC').trim()}
export function hasDamagedText(value:unknown){return /(?:Ã|Â|â€|\uFFFD)/.test(String(value??''))}
