// =====================================================================
//  Misura del testo e a capo automatico (testo SVG puro, senza HTML).
//  Entrambe le funzioni usano una cache: il disegno chiama getLabel
//  molte volte per ogni cella, ma il risultato cambia raramente.
// =====================================================================
const ctx = document.createElement('canvas').getContext('2d');
const MAX_CACHE = 5000;
const widthCache = new Map<string, number>();
const wrapCache = new Map<string, string>();

const fontOf = (size: number, family: string, bold: boolean, italic: boolean) =>
  `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px '${family}', sans-serif`;

function remember<V>(cache: Map<string, V>, key: string, value: V): V {
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, value);
  return value;
}

function width(text: string, font: string, size: number): number {
  const key = font + '|' + text;
  const hit = widthCache.get(key);
  if (hit !== undefined) return hit;
  let w = text.length * size * 0.55;
  if (ctx) { ctx.font = font; w = ctx.measureText(text).width; }
  return remember(widthCache, key, w);
}

export function measureText(text: string, size: number, family: string, bold = false, italic = false): number {
  return width(text, fontOf(size, family, bold, italic), size);
}

/** Restituisce il testo con gli "a capo" inseriti per stare in maxW */
export function wrapText(text: string, size: number, family: string, bold: boolean, italic: boolean, maxW: number): string {
  const font = fontOf(size, family, bold, italic);
  const key = `${font}|${Math.round(maxW)}|${text}`;
  const hit = wrapCache.get(key);
  if (hit !== undefined) return hit;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (!line || width(test, font, size) <= maxW) line = test;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return remember(wrapCache, key, out.join('\n'));
}
