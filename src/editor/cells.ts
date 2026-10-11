// =====================================================================
//  Utilità sulle celle maxGraph usate da editor, corsie e legenda
// =====================================================================
import type { AbstractGraph, Cell, CellStyle, Geometry } from '@maxgraph/core';
import type { NodeType, Rect, StyleMap } from '../core/types';

/** Proprietà applicative appese alle celle (copiate anche da clone e copia-incolla) */
export interface FcProps { fcType?: NodeType; fcLane?: boolean; fcLegend?: boolean; fcNoLegend?: boolean }
export type FcCell = Cell & FcProps;
export const fc = (c: Cell) => c as FcCell;

export const asStyle = (s: StyleMap) => s as unknown as CellStyle;
export const styleOf = (c: Cell): StyleMap => ({ ...(c.getStyle() as unknown as StyleMap) });

export function rectOf(c: Cell): Rect {
  const g = c.getGeometry();
  return g ? { x: g.x, y: g.y, w: g.width, h: g.height } : { x: 0, y: 0, w: 0, h: 0 };
}

/** Freccia libera: collegamento senza forme agli estremi */
export const isFreeEdge = (c: Cell | null | undefined): boolean =>
  !!c && c.isEdge() && !c.getTerminal(true) && !c.getTerminal(false);

export function childrenOf(parent: Cell): Cell[] {
  const out: Cell[] = [];
  for (let i = 0; i < parent.getChildCount(); i++) out.push(parent.getChildAt(i));
  return out;
}

export function descendantsOf(parent: Cell): Cell[] {
  const out: Cell[] = [];
  const stack = childrenOf(parent).reverse();
  while (stack.length) {
    const c = stack.pop()!;
    out.push(c);
    for (let i = c.getChildCount() - 1; i >= 0; i--) stack.push(c.getChildAt(i));
  }
  return out;
}

/** Modifica la geometria passando dal modello (quindi annullabile) */
export function setGeo(graph: AbstractGraph, c: Cell, fn: (g: Geometry) => void): void {
  const geo = c.getGeometry();
  if (!geo) return;
  const g2 = geo.clone();
  fn(g2);
  graph.getDataModel().setGeometry(c, g2);
}
