// =====================================================================
//  Forme personalizzate registrate in maxGraph (ShapeRegistry)
// =====================================================================
import { ActorShape, CylinderShape, Shape, ShapeRegistry, type AbstractCanvas2D } from '@maxgraph/core';
import type { LegendLayout } from '../core/legendLayout';
import type { DocLegend } from '../core/types';

/** Parallelogramma (dati input/output) */
class DataShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    const s = Math.min(20, w * 0.15);
    c.moveTo(s, 0); c.lineTo(w, 0); c.lineTo(w - s, h); c.lineTo(0, h); c.close();
  }
}

/** Documento con bordo inferiore ondulato */
class DocumentShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    const b = h * 0.85;
    c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, b);
    c.quadTo(w * 0.75, h * 0.7, w / 2, b);
    c.quadTo(w * 0.25, h, 0, b);
    c.close();
  }
}

/** Input manuale (lato superiore inclinato) */
class ManualShape extends ActorShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number): void {
    c.moveTo(0, h * 0.3); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(0, h); c.close();
  }
}

/** Sottoprocesso: rettangolo con due linee verticali interne */
class SubprocessShape extends CylinderShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false): void {
    if (isForeground) { c.moveTo(10, 0); c.lineTo(10, h); c.moveTo(w - 10, 0); c.lineTo(w - 10, h); }
    else { c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, h); c.lineTo(0, h); c.close(); }
  }
}

/** Nota con angolo piegato */
class NoteShape extends CylinderShape {
  override redrawPath(c: AbstractCanvas2D, _x: number, _y: number, w: number, h: number, isForeground = false): void {
    const k = Math.min(16, w * 0.2, h * 0.3);
    if (isForeground) { c.moveTo(w - k, 0); c.lineTo(w - k, k); c.lineTo(w, k); }
    else { c.moveTo(0, 0); c.lineTo(w - k, 0); c.lineTo(w, k); c.lineTo(w, h); c.lineTo(0, h); c.close(); }
  }
}

/* ---------------- Legenda ---------------- */
export interface LegendPaintData { cfg: DocLegend; layout: LegendLayout }

let legendProvider: () => LegendPaintData | null = () => null;
export function setLegendProvider(fn: () => LegendPaintData | null): void { legendProvider = fn; }

type TextFn = (x: number, y: number, w: number, h: number, str: string, align: string, valign: string,
  wrap: boolean, format: string, overflow: string | null, clip: boolean, rotation: number, dir: string | null) => void;

/** La legenda è un'unica cella: questa forma ne disegna riquadro, campioni e testi */
class LegendShape extends Shape {
  override paintVertexShape(c: AbstractCanvas2D, x: number, y: number, w: number, h: number): void {
    const data = legendProvider();
    c.setFillColor(data?.cfg.fill ?? '#ffffff');
    c.setStrokeColor(data?.cfg.stroke ?? '#c9ced6');
    c.setStrokeWidth(1);
    c.roundrect(x, y, w, h, 6, 6);
    c.fillAndStroke();
    if (!data) return;
    const { cfg, layout } = data;
    const text = (c as unknown as { text: TextFn }).text.bind(c);
    const label = (tx: number, ty: number, s: string) => text(tx, ty, 0, 0, s, 'left', 'middle', false, '', null, false, 0, null);
    c.setFontFamily('Arial');
    c.setFontSize(cfg.fontSize);
    if (cfg.title) {
      c.setFontColor('#333333');
      c.setFontStyle(1);
      label(x + 12, y + 12 + cfg.fontSize * 0.65, cfg.title);
    }
    const sh = layout.swatchH;
    for (const it of layout.items) {
      const cy = y + it.y + (layout.rowH - 10) / 2;
      const sx = x + it.x, sy = cy - sh / 2, sw = it.swatchW;
      c.setFillColor(it.entry.fill);
      c.setStrokeColor(it.entry.stroke);
      c.setStrokeWidth(1.5);
      switch (it.entry.type) {
        case 'decision':
          c.begin(); c.moveTo(sx + sw / 2, sy); c.lineTo(sx + sw, cy); c.lineTo(sx + sw / 2, sy + sh); c.lineTo(sx, cy); c.close();
          break;
        case 'circle': case 'ellipse': c.ellipse(sx, sy, sw, sh); break;
        case 'terminator': c.roundrect(sx, sy, sw, sh, sh / 2, sh / 2); break;
        default: c.roundrect(sx, sy, sw, sh, 3, 3);
      }
      c.fillAndStroke();
      c.setFontStyle(it.empty ? 2 : 0);
      c.setFontColor(it.empty ? '#9aa3ae' : '#333333');
      label(sx + sw + 8, cy, it.label);
    }
  }
}

let registered = false;
export function registerShapes(): void {
  if (registered) return;
  registered = true;
  ShapeRegistry.add('fcData', DataShape);
  ShapeRegistry.add('fcDocument', DocumentShape);
  ShapeRegistry.add('fcManual', ManualShape);
  ShapeRegistry.add('fcSubprocess', SubprocessShape);
  ShapeRegistry.add('fcNote', NoteShape);
  ShapeRegistry.add('fcLegend', LegendShape);
}
