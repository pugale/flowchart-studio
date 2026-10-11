// =====================================================================
//  Impaginazione della legenda (usata per disegnarla e per calcolarne
//  l'altezza). Modulo puro.
// =====================================================================
import type { DocLegend, NodeType } from './types';

export interface LegendEntry {
  /** colore di sfondo in minuscolo: è la chiave della voce */
  key: string;
  fill: string;
  stroke: string;
  type: NodeType;
}

export interface LegendItem {
  entry: LegendEntry;
  x: number;
  y: number;
  swatchW: number;
  label: string;
  empty: boolean;
}

export interface LegendLayout {
  height: number;
  rowH: number;
  swatchH: number;
  items: LegendItem[];
}

export const LEGEND_PAD = 12;
const SWATCH_H = 18;
const GAP = 30;

export function layoutLegend(
  entries: readonly LegendEntry[],
  cfg: Pick<DocLegend, 'w' | 'title' | 'fontSize' | 'descriptions'>,
  measure: (text: string, fontSize: number) => number
): LegendLayout {
  const fs = cfg.fontSize, pad = LEGEND_PAD;
  const rowH = Math.max(SWATCH_H, fs * 1.3) + 10;
  let x = pad, y = pad + (cfg.title ? fs * 1.3 + 8 : 0);
  const items: LegendItem[] = [];
  for (const entry of entries) {
    const desc = cfg.descriptions[entry.key] ?? '';
    const label = desc || 'Senza descrizione';
    const swatchW = entry.type === 'circle' ? SWATCH_H : 30;
    const w = swatchW + 8 + measure(label, fs);
    if (x > pad && x + w > cfg.w - pad) { x = pad; y += rowH; }
    items.push({ entry, x, y, swatchW, label, empty: !desc });
    x += w + GAP;
  }
  return { height: Math.ceil(y + rowH - 10 + pad), rowH, swatchH: SWATCH_H, items };
}
