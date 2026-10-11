// =====================================================================
//  Formato del file JSON - indipendente da maxGraph
// =====================================================================

export type NodeType =
  | 'process' | 'rounded' | 'terminator' | 'decision' | 'circle' | 'ellipse' | 'data'
  | 'document' | 'database' | 'preparation' | 'subprocess' | 'manual' | 'note' | 'title' | 'text';

export type Anchor = 't' | 'r' | 'b' | 'l';
export type BorderType = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'none';
export type PdfFormat = 'fit' | 'a4' | 'a3';

/** Stile di una cella: chiavi di stile maxGraph (fillColor, strokeColor, fontSize, ...) */
export type StyleValue = string | number | boolean;
export type StyleMap = Record<string, StyleValue>;

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

export interface DocNode extends Rect {
  id: string;
  /** id della corsia che la contiene, null = livello principale */
  parent: string | null;
  type: NodeType;
  text: string;
  inLegend: boolean;
  style: StyleMap;
}

export interface DocLane extends Rect {
  id: string;
  name: string;
  /** contiene anche laneDir: 'h' (orizzontale) o 'v' (verticale) */
  style: StyleMap;
}

/**
 * Collegamento o freccia libera.
 * Ogni estremo è agganciato a una forma (source/target) oppure libero (sourcePoint/targetPoint).
 * Freccia libera = entrambi gli estremi liberi.
 */
export interface DocEdge {
  id: string;
  source: string | null;
  target: string | null;
  sourcePoint?: Pt;
  targetPoint?: Pt;
  label: string;
  style: StyleMap;
  points?: Pt[];
  labelOffset?: Pt;
}

export interface DocLegend {
  visible: boolean;
  x: number;
  y: number;
  w: number;
  title: string;
  fontSize: number;
  fill: string;
  stroke: string;
  /** colore di sfondo (minuscolo) -> descrizione */
  descriptions: Record<string, string>;
}

export interface DocSettings {
  background: string;
  grid: boolean;
  snap: boolean;
  gridSize: number;
  autoGrow: boolean;
  pdfFormat: PdfFormat;
}

export const FORMAT_ID = 'flowchart-studio';
export const FORMAT_VERSION = 1;

export interface FlowDoc {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  name: string;
  settings: DocSettings;
  legend: DocLegend;
  lanes: DocLane[];
  nodes: DocNode[];
  edges: DocEdge[];
}

export function emptyDoc(): FlowDoc {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    name: 'diagramma',
    settings: { background: '#ffffff', grid: true, snap: true, gridSize: 10, autoGrow: true, pdfFormat: 'fit' },
    legend: {
      visible: true, x: 20, y: 20, w: 900, title: 'Legenda', fontSize: 12,
      fill: '#ffffff', stroke: '#c9ced6', descriptions: {}
    },
    lanes: [],
    nodes: [],
    edges: []
  };
}
