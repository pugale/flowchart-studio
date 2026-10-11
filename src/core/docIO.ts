// =====================================================================
//  Lettura dei file JSON del diagramma.
//  Il file viene validato campo per campo: valori mancanti o non validi
//  (es. file modificato a mano) vengono sostituiti dai valori predefiniti.
// =====================================================================
import { isNodeType, laneStyle, nodeStyle } from './styles';
import type { DocEdge, DocLane, DocNode, FlowDoc, Pt, StyleMap } from './types';
import { FORMAT_ID, FORMAT_VERSION, emptyDoc } from './types';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const objs = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const pt = (v: unknown): Pt | undefined => (isObj(v) ? { x: num(v.x, 0), y: num(v.y, 0) } : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const style = (v: unknown): StyleMap => {
  const out: StyleMap = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) {
    if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') out[k] = x;
  }
  return out;
};

export function parseDocJson(text: string): FlowDoc {
  const raw: unknown = JSON.parse(text);
  if (!isObj(raw) || raw.format !== FORMAT_ID) throw new Error('Il file non è un diagramma di Flowchart Studio');
  if (raw.version !== FORMAT_VERSION) throw new Error(`Versione del file non supportata (${String(raw.version)})`);

  const doc = emptyDoc();
  doc.name = str(raw.name, doc.name);

  const s = isObj(raw.settings) ? raw.settings : {};
  const d = doc.settings;
  doc.settings = {
    background: str(s.background, d.background),
    grid: bool(s.grid, d.grid),
    snap: bool(s.snap, d.snap),
    gridSize: num(s.gridSize, d.gridSize),
    autoGrow: bool(s.autoGrow, d.autoGrow),
    pdfFormat: oneOf(s.pdfFormat, ['fit', 'a4', 'a3'] as const, d.pdfFormat)
  };

  const l = isObj(raw.legend) ? raw.legend : {};
  const dl = doc.legend;
  const descriptions: Record<string, string> = {};
  if (isObj(l.descriptions)) for (const [k, v] of Object.entries(l.descriptions)) if (typeof v === 'string') descriptions[k.toLowerCase()] = v;
  doc.legend = {
    visible: bool(l.visible, dl.visible), x: num(l.x, dl.x), y: num(l.y, dl.y), w: num(l.w, dl.w),
    title: str(l.title, dl.title), fontSize: num(l.fontSize, dl.fontSize),
    fill: str(l.fill, dl.fill), stroke: str(l.stroke, dl.stroke), descriptions
  };

  doc.lanes = objs(raw.lanes).map((x, i): DocLane => ({
    id: str(x.id, 'lane' + i), name: str(x.name, 'Corsia'),
    x: num(x.x, 0), y: num(x.y, 0), w: num(x.w, 400), h: num(x.h, 250),
    style: { ...laneStyle(), ...style(x.style) }
  }));

  const laneIds = new Set(doc.lanes.map(x => x.id));
  doc.nodes = objs(raw.nodes).map((n, i): DocNode => {
    const type = isNodeType(n.type) ? n.type : 'process';
    return {
      id: str(n.id, 'n' + i),
      parent: typeof n.parent === 'string' && laneIds.has(n.parent) ? n.parent : null,
      type,
      x: num(n.x, 0), y: num(n.y, 0), w: num(n.w, 120), h: num(n.h, 60),
      text: str(n.text, ''), inLegend: bool(n.inLegend, type !== 'text' && type !== 'title'),
      style: { ...nodeStyle(type), ...style(n.style) }
    };
  });

  // ogni estremo: agganciato a una forma esistente oppure libero con un punto; altrimenti il collegamento si scarta
  const nodeIds = new Set(doc.nodes.map(n => n.id));
  const end = (id: unknown, p: unknown) => {
    const ref = typeof id === 'string' && nodeIds.has(id) ? id : null;
    return { ref, point: ref ? undefined : pt(p) };
  };
  doc.edges = objs(raw.edges).flatMap((e, i): DocEdge[] => {
    const s = end(e.source, e.sourcePoint), t = end(e.target, e.targetPoint);
    if ((!s.ref && !s.point) || (!t.ref && !t.point)) return [];
    return [{
      id: str(e.id, 'e' + i), source: s.ref, target: t.ref,
      ...(s.point ? { sourcePoint: s.point } : {}),
      ...(t.point ? { targetPoint: t.point } : {}),
      label: str(e.label, ''), style: style(e.style),
      ...(Array.isArray(e.points) ? { points: objs(e.points).map(p => pt(p)!) } : {}),
      ...(isObj(e.labelOffset) ? { labelOffset: pt(e.labelOffset)! } : {})
    }];
  });
  return doc;
}
