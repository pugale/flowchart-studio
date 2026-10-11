// =====================================================================
//  Palette a sinistra: trascina nella dashboard (o clic = al centro)
// =====================================================================
import { gestureUtils, type AbstractGraph, type Cell } from '@maxgraph/core';
import { FREE_ARROW_LENGTH, LANE_SIZE, NODE_DEFS, PALETTE_ORDER } from '../core/styles';
import type { NodeType } from '../core/types';
import type { DropKind, FlowEditor } from '../editor/FlowEditor';
import { $ } from './dom';

/** Icone SVG della palette (solo grafica, nessuna logica) */
function icon(kind: DropKind): string {
  const box = (inner: string) => `<svg viewBox="0 0 48 34" width="48" height="34" aria-hidden="true">${inner}</svg>`;
  if (kind === 'lane') return box('<rect x="2" y="5" width="44" height="24" rx="3" fill="#f1f6fb" stroke="#9fb6cc"/><rect x="2" y="5" width="9" height="24" rx="2" fill="#5b9bd5"/>');
  if (kind === 'laneV') return box('<rect x="12" y="1" width="24" height="32" rx="3" fill="#f1f6fb" stroke="#9fb6cc"/><rect x="12" y="1" width="24" height="8" rx="2" fill="#5b9bd5"/>');
  if (kind === 'arrow') return box('<path d="M5 17H34" stroke="#2f80ed" stroke-width="3" stroke-linecap="round"/><polygon points="33,10 44,17 33,24" fill="#2f80ed"/>');
  if (kind === 'text') return box('<text x="24" y="24" text-anchor="middle" font-size="18" font-family="Georgia" fill="#333">Aa</text>');
  const d = NODE_DEFS[kind];
  const f = `fill="${d.fill}" stroke="${d.stroke}" stroke-width="1.3"`;
  const line = `fill="none" stroke="${d.stroke}"`;
  const shapes: Record<Exclude<NodeType, 'text'>, string> = {
    process: `<rect x="4" y="7" width="40" height="20" ${f}/>`,
    rounded: `<rect x="4" y="7" width="40" height="20" rx="5" ${f}/>`,
    terminator: `<rect x="4" y="8" width="40" height="18" rx="9" ${f}/>`,
    decision: `<polygon points="24,3 45,17 24,31 3,17" ${f}/>`,
    circle: `<circle cx="24" cy="17" r="13" ${f}/>`,
    ellipse: `<ellipse cx="24" cy="17" rx="20" ry="12" ${f}/>`,
    data: `<polygon points="10,7 45,7 38,27 3,27" ${f}/>`,
    document: `<path d="M4 6H44V25Q34 20 24 25T4 25Z" ${f}/>`,
    database: `<path d="M8 8A16 4 0 0 1 40 8V27A16 4 0 0 1 8 27Z" ${f}/><path d="M8 8A16 4 0 0 0 40 8" ${line}/>`,
    preparation: `<polygon points="10,7 38,7 45,17 38,27 10,27 3,17" ${f}/>`,
    subprocess: `<rect x="4" y="7" width="40" height="20" ${f}/><path d="M9 7V27M39 7V27" ${line}/>`,
    manual: `<polygon points="4,13 44,6 44,27 4,27" ${f}/>`,
    note: `<path d="M6 5H34L42 13V29H6Z" ${f}/><path d="M34 5V13H42" ${line}/>`,
    title: `<rect x="2" y="9" width="44" height="16" rx="4" ${f}/>`
  };
  return box(shapes[kind]);
}

const sizeOf = (kind: DropKind) =>
  kind === 'lane' ? LANE_SIZE.h : kind === 'laneV' ? LANE_SIZE.v
    : kind === 'arrow' ? { w: FREE_ARROW_LENGTH, h: 20 } : { w: NODE_DEFS[kind].w, h: NODE_DEFS[kind].h };

export function buildPalette(ed: FlowEditor): void {
  const make = (kind: DropKind, label: string, host: HTMLElement) => {
    const el = document.createElement('div');
    el.className = 'pal-item';
    el.title = `${label} — trascina nella dashboard (o fai clic)`;
    el.innerHTML = `${icon(kind)}<span>${label}</span>`;
    host.appendChild(el);

    // anteprima tratteggiata, centrata sul mouse durante il trascinamento
    const size = sizeOf(kind);
    const preview = document.createElement('div');
    preview.className = kind === 'arrow' ? 'drag-preview arrow' : 'drag-preview';
    preview.style.width = size.w + 'px';
    preview.style.height = size.h + 'px';
    const free = kind === 'lane' || kind === 'laneV' || kind === 'arrow';

    gestureUtils.makeDraggable(
      el, ed.graph,
      (_g: AbstractGraph, _evt: MouseEvent, target: Cell | null, x?: number, y?: number) => {
        // x,y = angolo in alto a sinistra dell'anteprima: passiamo il centro
        ed.dropShape(kind, (x ?? 0) + size.w / 2, (y ?? 0) + size.h / 2, free ? null : target);
      },
      preview, -size.w / 2, -size.h / 2, true, true, true
    );
    el.addEventListener('click', () => {
      const c = ed.viewCenter();
      ed.dropShape(kind, c.x, c.y, null);
    });
  };
  const shapes = $('#palette-shapes');
  for (const t of PALETTE_ORDER) make(t, NODE_DEFS[t].label, shapes);
  make('arrow', 'Freccia libera', $('#palette-lines'));
  make('lane', 'Corsia orizzontale', $('#palette-containers'));
  make('laneV', 'Corsia verticale', $('#palette-containers'));
}
