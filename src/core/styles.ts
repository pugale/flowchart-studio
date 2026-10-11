// =====================================================================
//  Catalogo forme, colori pronti e costruzione degli stili maxGraph
// =====================================================================
import type { Anchor, BorderType, NodeType, StyleMap } from './types';

export const FONTS = ['Arial', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Segoe UI', 'Calibri',
  'Georgia', 'Times New Roman', 'Courier New', 'Consolas'] as const;

export interface ColorPreset { name: string; fill: string; stroke: string }
export const PRESETS: readonly ColorPreset[] = [
  { name: 'Automatico (sistema)', fill: '#ffe6cc', stroke: '#d79b00' },
  { name: 'Operatore (manuale)', fill: '#d5e8d4', stroke: '#82b366' },
  { name: 'Fascicolo', fill: '#f0e6fa', stroke: '#9673a6' },
  { name: 'Decisione', fill: '#fff2cc', stroke: '#d6b656' },
  { name: 'Canale di ingresso', fill: '#dae8fc', stroke: '#6c8ebf' },
  { name: 'Esito positivo', fill: '#e8f5e9', stroke: '#2e7d32' },
  { name: 'Esito negativo', fill: '#fdecea', stroke: '#c62828' },
  { name: 'Neutro', fill: '#f5f5f5', stroke: '#666666' },
  { name: 'Scuro', fill: '#1f4e79', stroke: '#16384f' },
  { name: 'Bianco', fill: '#ffffff', stroke: '#333333' }
];

export interface LanePreset { name: string; header: string; body: string; border: string }
export const LANE_PRESETS: readonly LanePreset[] = [
  { name: 'Blu', header: '#5b9bd5', body: '#f1f6fb', border: '#c9d6e3' },
  { name: 'Grigio', header: '#7f8c8d', body: '#f4f5f7', border: '#d0d4d8' },
  { name: 'Oro', header: '#d4a017', body: '#fffcf0', border: '#eadfb8' },
  { name: 'Verde', header: '#2e7d32', body: '#f2f8f2', border: '#c8dcc8' },
  { name: 'Viola', header: '#8e6bbf', body: '#f6f1fb', border: '#dccdee' },
  { name: 'Rosso', header: '#c0392b', body: '#fdf3f2', border: '#efc9c4' }
];

export const EDGE_COLORS = ['#5b6573', '#c0392b', '#2e7d32', '#2f80ed', '#d79b00', '#000000'] as const;

interface NodeDef {
  label: string;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  text: string;
  shape: StyleMap;
  bold?: boolean;
  fontSize?: number;
  fontColor?: string;
  strokeWidth?: number;
  inLegend?: boolean;
  /** frazione di larghezza utile per il testo (rombo, cerchio...) */
  textRatio?: number;
}

export const NODE_DEFS: Readonly<Record<NodeType, NodeDef>> = {
  process: { label: 'Processo', w: 200, h: 60, fill: '#ffe6cc', stroke: '#d79b00', text: 'Processo', shape: { shape: 'rectangle', rounded: false } },
  rounded: { label: 'Attività', w: 200, h: 60, fill: '#d5e8d4', stroke: '#82b366', text: 'Attività', shape: { shape: 'rectangle', rounded: true, arcSize: 16 } },
  terminator: { label: 'Inizio / Fine', w: 160, h: 50, fill: '#dae8fc', stroke: '#6c8ebf', text: 'Inizio', shape: { shape: 'rectangle', rounded: true, arcSize: 50 } },
  decision: { label: 'Decisione', w: 160, h: 100, fill: '#fff2cc', stroke: '#d6b656', text: 'Decisione?', bold: true, textRatio: 0.6, shape: { shape: 'rhombus', perimeter: 'rhombusPerimeter' } },
  circle: { label: 'Stato (cerchio)', w: 100, h: 100, fill: '#e8f5e9', stroke: '#2e7d32', text: 'Stato', bold: true, fontSize: 10, fontColor: '#2e7d32', strokeWidth: 2.5, textRatio: 0.7, shape: { shape: 'ellipse', perimeter: 'ellipsePerimeter', aspect: 'fixed' } },
  ellipse: { label: 'Ellisse', w: 150, h: 80, fill: '#dae8fc', stroke: '#6c8ebf', text: 'Ellisse', textRatio: 0.7, shape: { shape: 'ellipse', perimeter: 'ellipsePerimeter' } },
  data: { label: 'Dati (input/output)', w: 180, h: 60, fill: '#dae8fc', stroke: '#6c8ebf', text: 'Dati', textRatio: 0.8, shape: { shape: 'fcData' } },
  document: { label: 'Documento', w: 180, h: 70, fill: '#f0e6fa', stroke: '#9673a6', text: 'Documento', shape: { shape: 'fcDocument', spacingBottom: 10 } },
  database: { label: 'Database', w: 120, h: 80, fill: '#f5f5f5', stroke: '#666666', text: 'Database', shape: { shape: 'cylinder', spacingTop: 14 } },
  preparation: { label: 'Preparazione', w: 180, h: 60, fill: '#fff2cc', stroke: '#d6b656', text: 'Preparazione', textRatio: 0.8, shape: { shape: 'hexagon', perimeter: 'hexagonPerimeter' } },
  subprocess: { label: 'Sottoprocesso', w: 200, h: 60, fill: '#ffe6cc', stroke: '#d79b00', text: 'Sottoprocesso', textRatio: 0.85, shape: { shape: 'fcSubprocess' } },
  manual: { label: 'Input manuale', w: 180, h: 60, fill: '#d5e8d4', stroke: '#82b366', text: 'Input manuale', shape: { shape: 'fcManual', spacingTop: 12 } },
  note: { label: 'Nota', w: 160, h: 80, fill: '#fff9c4', stroke: '#c9b458', text: 'Nota', shape: { shape: 'fcNote', align: 'left', spacingLeft: 8, spacingRight: 18 } },
  title: { label: 'Titolo (banner)', w: 600, h: 50, fill: '#1f4e79', stroke: '#16384f', text: 'TITOLO', bold: true, fontSize: 20, fontColor: '#ffffff', inLegend: false, shape: { shape: 'rectangle', rounded: true, arcSize: 16 } },
  text: { label: 'Testo libero', w: 160, h: 40, fill: 'none', stroke: 'none', text: 'Testo', fontSize: 14, inLegend: false, shape: { shape: 'rectangle' } }
};

export const PALETTE_ORDER: readonly NodeType[] = ['process', 'rounded', 'terminator', 'decision', 'circle', 'ellipse', 'data',
  'document', 'database', 'preparation', 'subprocess', 'manual', 'note', 'title', 'text'];

export const isNodeType = (t: unknown): t is NodeType => typeof t === 'string' && Object.hasOwn(NODE_DEFS, t);

export interface NodeLook {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

/** Stile completo di una forma, con eventuali personalizzazioni */
export function nodeStyle(type: NodeType, look: NodeLook = {}): StyleMap {
  const d = NODE_DEFS[type];
  const bold = look.bold ?? !!d.bold;
  const italic = look.italic ?? false;
  return {
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
    spacing: 4,
    fontFamily: look.fontFamily ?? 'Arial',
    fontSize: look.fontSize ?? d.fontSize ?? 12,
    fontColor: look.fontColor ?? d.fontColor ?? '#333333',
    fontStyle: (bold ? 1 : 0) | (italic ? 2 : 0),
    align: look.align ?? 'center',
    ...d.shape,
    fillColor: type === 'text' ? 'none' : look.fill || d.fill,
    strokeColor: type === 'text' ? 'none' : look.stroke || d.stroke,
    strokeWidth: look.strokeWidth ?? d.strokeWidth ?? 1.5
  };
}

const colorOrUndef = (v: unknown) => (typeof v === 'string' && v !== 'none' ? v : undefined);

/** Cambia il tipo mantenendo colori e testo */
export function retypeStyle(old: StyleMap, newType: NodeType): StyleMap {
  const fs = Number(old.fontStyle ?? 0);
  const s = nodeStyle(newType, {
    fill: colorOrUndef(old.fillColor),
    stroke: colorOrUndef(old.strokeColor),
    strokeWidth: Number(old.strokeWidth ?? 1.5),
    fontFamily: String(old.fontFamily ?? 'Arial'),
    fontSize: Number(old.fontSize ?? 12),
    fontColor: String(old.fontColor ?? '#333333'),
    bold: (fs & 1) === 1,
    italic: (fs & 2) === 2,
    align: (old.align as NodeLook['align']) ?? 'center'
  });
  if (old.textCase) s.textCase = old.textCase;
  return s;
}

/* ---------------- Maiuscole / minuscole ---------------- */
/**
 * Trasformazione del testo applicata solo alla visualizzazione (stile "textCase"):
 * il testo originale resta salvato e si può tornare a "Come scritto" in ogni momento.
 */
export type TextCase = 'none' | 'upper' | 'lower' | 'sentence';
export const TEXT_CASES: readonly (readonly [TextCase, string])[] = [
  ['none', 'Come scritto'],
  ['upper', 'TUTTO MAIUSCOLO'],
  ['lower', 'tutto minuscolo'],
  ['sentence', 'Solo prima lettera maiuscola']
];
export const textCaseOf = (s: StyleMap): TextCase =>
  (TEXT_CASES.some(([k]) => k === s.textCase) ? s.textCase : 'none') as TextCase;

export function applyTextCase(text: string, c: TextCase): string {
  switch (c) {
    case 'upper': return text.toLocaleUpperCase('it-IT');
    case 'lower': return text.toLocaleLowerCase('it-IT');
    case 'sentence': {
      const low = text.toLocaleLowerCase('it-IT');
      const i = low.search(/\p{L}/u);          // prima lettera, anche dopo parentesi o numeri
      return i < 0 ? low : low.slice(0, i) + low[i].toLocaleUpperCase('it-IT') + low.slice(i + 1);
    }
    default: return text;
  }
}

/* ---------------- Corsie ---------------- */
export const DASH_PATTERNS = { dashed: '6 4', dotted: '1 3', dashdot: '8 3 1 3' } as const;
type DashKind = keyof typeof DASH_PATTERNS;

/**
 * Orientamento della corsia:
 *  'h' orizzontale = corsia larga, nome nella banda verticale a sinistra, corsie impilate dall'alto in basso
 *  'v' verticale   = corsia alta (colonna), nome nella banda in alto, corsie affiancate da sinistra a destra
 */
export type LaneDir = 'h' | 'v';
export const LANE_SIZE: Readonly<Record<LaneDir, { w: number; h: number }>> = { h: { w: 500, h: 250 }, v: { w: 250, h: 500 } };
export const BAND_SIZE = 34;

export interface LaneLook {
  header?: string;
  body?: string;
  border?: string;
  borderType?: BorderType;
  dir?: LaneDir;
}

export function laneStyle(look: LaneLook = {}): StyleMap {
  const p = LANE_PRESETS[0];
  const dir = look.dir ?? 'h';
  return applyBorder({
    shape: 'swimlane',
    laneDir: dir,
    horizontal: dir === 'v',      // maxGraph: horizontal=true → nome in alto
    startSize: BAND_SIZE,
    fillColor: look.header ?? p.header,
    swimlaneFillColor: look.body ?? p.body,
    strokeColor: look.border ?? p.border,
    strokeWidth: 1,
    fontColor: '#ffffff',
    fontStyle: 1,
    fontFamily: 'Arial',
    fontSize: 12,
    swimlaneLine: false,
    collapsible: false
  }, look.borderType ?? 'solid');
}

export const laneDirOf = (s: StyleMap): LaneDir => (s.laneDir === 'v' ? 'v' : 'h');

/** Cambia l'orientamento (la geometria si scambia in FlowEditor.setLaneDir) */
export function setLaneDir(s: StyleMap, dir: LaneDir): StyleMap {
  s.laneDir = dir;
  s.horizontal = dir === 'v';
  return s;
}

export const showsBand = (s: StyleMap): boolean => Number(s.startSize ?? BAND_SIZE) > 0;

export function applyBorder(style: StyleMap, b: BorderType): StyleMap {
  const dashed = b !== 'solid' && b !== 'none';
  style.dashed = dashed;
  if (dashed) style.dashPattern = DASH_PATTERNS[b];
  else delete style.dashPattern;
  style.strokeOpacity = b === 'none' ? 0 : 100;
  return style;
}

export function borderOf(style: StyleMap): BorderType {
  if (Number(style.strokeOpacity ?? 100) === 0) return 'none';
  if (!style.dashed) return 'solid';
  const pat = String(style.dashPattern ?? '');
  return (Object.keys(DASH_PATTERNS) as DashKind[]).find(k => DASH_PATTERNS[k] === pat) ?? 'dashed';
}

/** Spazio occupato dalla banda del nome: a sinistra (orizzontale) o in alto (verticale) */
export function laneInset(style: StyleMap): { l: number; t: number } {
  const s = Number(style.startSize ?? 0);
  return laneDirOf(style) === 'v' ? { l: 0, t: s } : { l: s, t: 0 };
}

/* ---------------- Collegamenti e frecce ---------------- */
export type Routing = 'orthogonal' | 'straight' | 'curved';
export type ArrowMode = 'end' | 'start' | 'both' | 'none';
export type LineDash = 'solid' | 'dashed' | 'dotted';

export const ANCHOR_POINT: Readonly<Record<Anchor, readonly [number, number]>> = { t: [0.5, 0], r: [1, 0.5], b: [0.5, 1], l: [0, 0.5] };

export interface EdgeLook {
  color?: string;
  from?: Anchor;
  to?: Anchor;
}

export function edgeStyle(look: EdgeLook = {}, background = '#ffffff'): StyleMap {
  const color = look.color ?? '#5b6573';
  const s: StyleMap = {
    strokeColor: color,
    strokeWidth: 1.5,
    rounded: true,
    fontFamily: 'Arial',
    fontSize: 10,
    fontStyle: 1,
    fontColor: color,
    labelBackgroundColor: background,
    endSize: 7,
    startSize: 7
  };
  setRouting(s, 'orthogonal');
  setArrows(s, 'end');
  setDash(s, 'solid');
  if (look.from) {
    const [x, y] = ANCHOR_POINT[look.from];
    Object.assign(s, { exitX: x, exitY: y, exitPerimeter: true });
  }
  if (look.to) {
    const [x, y] = ANCHOR_POINT[look.to];
    Object.assign(s, { entryX: x, entryY: y, entryPerimeter: true });
  }
  return s;
}

/** Freccia libera della palette: dritta, più spessa e con punta piena */
export const FREE_ARROW_LENGTH = 160;
export function freeArrowStyle(background = '#ffffff'): StyleMap {
  const s = setRouting(edgeStyle({ color: '#2f80ed' }, background), 'straight');
  return { ...s, strokeWidth: 3, endArrow: 'block', endSize: 10, rounded: false };
}

export function setRouting(s: StyleMap, r: Routing): StyleMap {
  // noEdgeStyle disattiva anche il percorso a gomito ereditato dallo stile predefinito
  s.edgeStyle = 'orthogonalEdgeStyle';
  s.noEdgeStyle = r === 'straight';
  s.curved = r === 'curved';
  return s;
}
export const routingOf = (s: StyleMap): Routing => (s.noEdgeStyle ? 'straight' : s.curved ? 'curved' : 'orthogonal');

export function setArrows(s: StyleMap, a: ArrowMode): StyleMap {
  s.endArrow = a === 'end' || a === 'both' ? 'classic' : 'none';
  s.startArrow = a === 'start' || a === 'both' ? 'classic' : 'none';
  return s;
}
export function arrowsOf(s: StyleMap): ArrowMode {
  const e = (s.endArrow ?? 'classic') !== 'none', st = (s.startArrow ?? 'none') !== 'none';
  return e && st ? 'both' : e ? 'end' : st ? 'start' : 'none';
}

export function setDash(s: StyleMap, d: LineDash): StyleMap {
  s.dashed = d !== 'solid';
  if (d === 'solid') delete s.dashPattern;
  else s.dashPattern = DASH_PATTERNS[d];
  return s;
}
export const dashOf = (s: StyleMap): LineDash => (!s.dashed ? 'solid' : s.dashPattern === DASH_PATTERNS.dotted ? 'dotted' : 'dashed');

/** Inverte i punti di ancoraggio di inizio e fine */
export function swapEnds(st: StyleMap): StyleMap {
  const out: StyleMap = { ...st };
  for (const [a, b] of [['exitX', 'entryX'], ['exitY', 'entryY'], ['exitPerimeter', 'entryPerimeter']] as const) {
    delete out[a]; delete out[b];
    if (st[b] !== undefined) out[a] = st[b];
    if (st[a] !== undefined) out[b] = st[a];
  }
  return out;
}

/* ---------------- Utilità colore ---------------- */
export function toHex(c: unknown): string {
  if (typeof c !== 'string') return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map(x => x + x).join('').toLowerCase();
  return '#000000';
}

const rgb = (hex: string) => {
  const h = toHex(hex).slice(1);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};

export function darken(hex: string, k = 0.45): string {
  return '#' + rgb(hex).map(v => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('');
}

export function isDark(hex: string): boolean {
  const [r, g, b] = rgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
