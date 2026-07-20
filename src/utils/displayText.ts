const mojibake: ReadonlyArray<readonly [string, string]> = [
  ["â€”", "—"], ["â€“", "–"], ["â€˜", "‘"], ["â€™", "’"], ["â€œ", "“"], ["â€", "”"],
  ["Ã±", "ñ"], ["Ã‘", "Ñ"], ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
  ["Ã", "Á"], ["Ã‰", "É"], ["Ã", "Í"], ["Ã“", "Ó"], ["Ãš", "Ú"], ["Ã¼", "ü"], ["Ãœ", "Ü"],
  ["Â°", "°"], ["Âº", "º"], ["Â·", "·"], ["Â", ""],
];

export function sanitizeDisplayText(value: unknown): string {
  let text = String(value ?? "").normalize("NFC");
  for (const [broken, valid] of mojibake) text = text.replaceAll(broken, valid);
  // Los controles C0/C1 no son texto visible válido.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "").replace(/\uFFFD/g, "").normalize("NFC").trim();
}
