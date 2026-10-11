// =====================================================================
//  Legenda automatica: una sola cella con forma "fcLegend".
//  Il ricalcolo è raggruppato (una volta per fotogramma) e non entra
//  nella cronologia annulla/ripeti.
// =====================================================================
import type { Cell } from '@maxgraph/core';
import { layoutLegend, type LegendEntry } from '../core/legendLayout';
import type { DocLegend } from '../core/types';
import { asStyle, fc, rectOf, setGeo, styleOf, type FcCell } from './cells';
import type { FlowEditor } from './FlowEditor';
import { setLegendProvider, type LegendPaintData } from './shapes';
import { measureText } from './text';

export class LegendController {
  private cell: FcCell | null = null;
  private data: LegendPaintData | null = null;
  private frame = 0;
  private lastSig = '';

  constructor(private readonly ed: FlowEditor) {
    setLegendProvider(() => this.data);
  }

  get current(): Cell | null { return this.cell; }

  create(parent: Cell, l: DocLegend): void {
    const cell = this.ed.graph.insertVertex({
      parent, id: 'legend', value: '', position: [l.x, l.y], size: [l.w, 40],
      style: asStyle({ shape: 'fcLegend', resizable: false, editable: false, deletable: false, rotatable: false })
    }) as FcCell;
    cell.fcLegend = true;
    cell.setConnectable(false);
    this.cell = cell;
    this.lastSig = '';
  }

  /** Posizione attuale (la legenda si può trascinare) */
  position(): { x: number; y: number; w: number } | null {
    if (!this.cell) return null;
    const r = rectOf(this.cell);
    return { x: r.x, y: r.y, w: r.w };
  }

  /** Voci della legenda: un colore di sfondo = una voce */
  entries(): LegendEntry[] {
    const map = new Map<string, LegendEntry>();
    for (const c of this.ed.allCells()) {
      if (!this.ed.isNode(c) || fc(c).fcNoLegend) continue;
      const type = this.ed.typeOf(c);
      if (type === 'text' || type === 'title') continue;
      const st = styleOf(c);
      const fill = String(st.fillColor ?? '');
      if (!fill || fill === 'none') continue;
      const key = fill.toLowerCase();
      if (!map.has(key)) map.set(key, { key, fill, stroke: String(st.strokeColor ?? '#666666'), type });
    }
    return [...map.values()];
  }

  /** Chiede un ricalcolo al prossimo fotogramma (molte modifiche = un solo ricalcolo) */
  schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.refresh(); });
  }

  refresh(force = false): void {
    const cell = this.cell;
    if (!cell) return;
    const cfg = this.ed.meta.legend;
    const entries = this.entries();
    const sig = JSON.stringify([entries, cfg.visible, cfg.w, cfg.title, cfg.fontSize, cfg.fill, cfg.stroke, cfg.descriptions]);
    if (!force && sig === this.lastSig) return;
    this.lastSig = sig;

    const layout = layoutLegend(entries, cfg, (t, fs) => measureText(t, fs, 'Arial'));
    this.data = { cfg, layout };
    const visible = cfg.visible && entries.length > 0;
    const geo = cell.getGeometry()!;
    const needGeo = Math.abs(geo.height - layout.height) > 0.5 || Math.abs(geo.width - cfg.w) > 0.5;
    if (needGeo || cell.isVisible() !== visible) {
      this.ed.silent(() => {
        if (needGeo) setGeo(this.ed.graph, cell, g => { g.height = layout.height; g.width = cfg.w; });
        if (cell.isVisible() !== visible) this.ed.graph.getDataModel().setVisible(cell, visible);
      });
    }
    this.ed.graph.getView().getState(cell)?.shape?.redraw();
  }
}
