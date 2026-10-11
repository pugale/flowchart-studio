// =====================================================================
//  Esportazione: JPG (immagine) e PDF.
//  PDF: prima si prova la versione vettoriale (jsPDF + svg2pdf.js); se non
//  riesce, si crea un PDF con l'immagine ad alta risoluzione del diagramma,
//  così il PDF viene sempre prodotto.
//  Questo modulo (con le librerie PDF) si carica solo al primo "Esporta".
// =====================================================================
import { fileBase } from './fileName';
import type { FlowEditor } from './FlowEditor';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = 24;
const MAX_SIDE = 16000;
const MAX_PIXELS = 120e6;
const PDF_RASTER_SCALE = 3;          // ~ 216 dpi
const VECTOR_TIMEOUT_MS = 30000;

interface ExportSvg { svg: SVGSVGElement; w: number; h: number }
export type PdfResult = 'vector' | 'raster' | 'empty';

/** SVG autonomo con il solo disegno (senza maniglie di selezione), a scala 1 */
function buildExportSvg(ed: FlowEditor): ExportSvg | null {
  const g = ed.graph;
  g.stopEditing(false);
  g.clearSelection();
  const view = g.getView();
  const b = g.getGraphBounds();
  if (!b || (b.width === 0 && b.height === 0)) return null;
  const s = view.scale;
  const w = Math.ceil(b.width / s + 2 * MARGIN), h = Math.ceil(b.height / s + 2 * MARGIN);

  const svg = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ xmlns: NS, width: w, height: h, viewBox: `0 0 ${w} ${h}` })) svg.setAttribute(k, String(v));
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(w));
  bg.setAttribute('height', String(h));
  bg.setAttribute('fill', ed.meta.settings.background);

  const wrap = document.createElementNS(NS, 'g');
  wrap.setAttribute('transform', `scale(${1 / s}) translate(${-b.x + MARGIN * s} ${-b.y + MARGIN * s})`);
  const pane = view.getDrawPane().cloneNode(true) as SVGGElement;
  pane.removeAttribute('id');
  pane.querySelectorAll('[pointer-events],[cursor]').forEach(el => { el.removeAttribute('pointer-events'); el.removeAttribute('cursor'); });
  wrap.appendChild(pane);
  svg.append(bg, wrap);
  return { svg, w, h };
}

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Disegna l'SVG su un canvas (usato per JPG e per il PDF di riserva) */
async function rasterize(r: ExportSvg, scale: number, background: string): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(r.svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(scale, MAX_SIDE / Math.max(r.w, r.h), Math.sqrt(MAX_PIXELS / (r.w * r.h)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(r.w * k);
    canvas.height = Math.round(r.h * k);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportJpg(ed: FlowEditor, scale = 2): Promise<boolean> {
  const r = buildExportSvg(ed);
  if (!r) return false;
  const canvas = await rasterize(r, scale, ed.meta.settings.background);
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.95));
  if (!blob) throw new Error('Conversione JPG non riuscita');
  download(blob, fileBase(ed) + '.jpg');
  return true;
}

/* ---------------- PDF ---------------- */
const PDF_FONT = (family: string) =>
  /courier|consolas|mono/i.test(family) ? 'courier' : /times|georgia|serif(?!-)/i.test(family) && !/sans/i.test(family) ? 'times' : 'helvetica';

/**
 * Adatta l'SVG a svg2pdf.js, che supporta solo una parte dello standard SVG:
 * - toglie gli elementi invisibili usati da maxGraph per i clic (aree "trasparenti")
 * - sostituisce "transparent" con "none"
 * - usa i font standard del PDF (helvetica, times, courier) al posto di quelli di sistema
 */
function prepareForPdf(svg: SVGSVGElement): void {
  svg.querySelectorAll('[visibility="hidden"],[display="none"]').forEach(el => el.remove());
  svg.querySelectorAll('*').forEach(el => {
    for (const attr of ['fill', 'stroke'] as const) {
      const v = el.getAttribute(attr);
      if (v && /^(transparent|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(v.trim())) el.setAttribute(attr, 'none');
    }
    const ff = el.getAttribute('font-family');
    if (ff) el.setAttribute('font-family', PDF_FONT(ff));
    const st = (el as SVGElement).style;
    if (st?.fontFamily) st.fontFamily = PDF_FONT(st.fontFamily);
    if (st?.cursor) st.cursor = '';
  });
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Tempo scaduto')), ms))]);

export async function exportPdf(ed: FlowEditor): Promise<PdfResult> {
  const r = buildExportSvg(ed);
  if (!r) return 'empty';
  const { jsPDF } = await import('jspdf');
  const fmt = ed.meta.settings.pdfFormat;
  const orientation = r.w >= r.h ? 'landscape' : 'portrait';
  const name = fileBase(ed) + '.pdf';

  const newPdf = () => {
    const pdf = new jsPDF({ orientation, unit: 'pt', format: fmt === 'fit' ? [r.w, r.h] : fmt, compress: true });
    let box = { x: 0, y: 0, width: r.w, height: r.h };
    if (fmt !== 'fit') {
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 28;
      const k = Math.min((pw - 2 * m) / r.w, (ph - 2 * m) / r.h);
      box = { x: (pw - r.w * k) / 2, y: (ph - r.h * k) / 2, width: r.w * k, height: r.h * k };
    }
    return { pdf, box };
  };

  // 1. PDF vettoriale
  const vectorSvg = r.svg.cloneNode(true) as SVGSVGElement;
  prepareForPdf(vectorSvg);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  host.appendChild(vectorSvg);
  document.body.appendChild(host);
  try {
    await import('svg2pdf.js');                 // aggiunge pdf.svg() a jsPDF
    const { pdf, box } = newPdf();
    const svgFn = (pdf as unknown as { svg?: (el: Element, o: object) => Promise<unknown> }).svg;
    if (typeof svgFn !== 'function') throw new Error('svg2pdf.js non disponibile');
    await withTimeout(svgFn.call(pdf, vectorSvg, box), VECTOR_TIMEOUT_MS);
    download(pdf.output('blob'), name);
    return 'vector';
  } catch (e) {
    console.warn('PDF vettoriale non riuscito, creo il PDF come immagine:', e);
  } finally {
    host.remove();
  }

  // 2. PDF con immagine ad alta risoluzione (sempre funzionante)
  const canvas = await rasterize(r, PDF_RASTER_SCALE, ed.meta.settings.background);
  const { pdf, box } = newPdf();
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', box.x, box.y, box.width, box.height);
  download(pdf.output('blob'), name);
  return 'raster';
}
