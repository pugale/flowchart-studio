// =====================================================================
//  Corsie che si allargano da sole (orizzontali e verticali).
//  Viene eseguito dentro la stessa transazione dello spostamento,
//  quindi un solo Ctrl+Z annulla tutto.
// =====================================================================
import type { Cell } from '@maxgraph/core';
import { resolveLaneOverlaps } from '../core/laneStack';
import { laneDirOf, laneInset } from '../core/styles';
import type { Rect } from '../core/types';
import { childrenOf, rectOf, setGeo, styleOf } from './cells';
import type { FlowEditor } from './FlowEditor';

const LANE_PAD = 20;   // margine minimo tra forma e bordo della corsia
const LANE_GAP = 10;   // spazio tra corsie vicine

export type GrowReason = 'move' | 'resize' | 'add';

export class LaneManager {
  /** posizione delle corsie prima dell'ultima modifica (per tenerle allineate) */
  private before = new Map<string, Rect>();
  private busy = false;

  constructor(private readonly ed: FlowEditor) {}

  remember(): void {
    this.before.clear();
    for (const l of this.ed.lanes()) this.before.set(l.getId() ?? '', rectOf(l));
  }

  normalize(cells: readonly Cell[] | null, reason: GrowReason, force = false): void {
    if ((!this.ed.meta.settings.autoGrow && !force) || this.busy) return;
    if (!cells?.some(c => c.isVertex())) return;
    const lanes = this.ed.lanes();
    if (!lanes.length) return;
    const moved = new Set(reason === 'move' ? cells.filter(c => this.ed.isLane(c)) : []);
    const resized = new Set(reason === 'resize' ? cells.filter(c => this.ed.isLane(c)) : []);
    const graph = this.ed.graph;
    const { snap, gridSize } = this.ed.meta.settings;
    const up = (v: number) => (snap ? Math.ceil(v / gridSize) * gridSize : Math.ceil(v));
    const dirOf = (c: Cell) => laneDirOf(styleOf(c));

    this.busy = true;
    try {
      graph.batchUpdate(() => {
        const changed = new Set<Cell>(resized);

        // A. ogni corsia contiene il proprio contenuto con un margine (banda del nome esclusa)
        for (const lane of lanes) {
          const kids = childrenOf(lane).filter(c => c.isVertex()).map(rectOf);
          if (!kids.length) continue;
          const r = rectOf(lane);
          const ins = laneInset(styleOf(lane));
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const k of kids) {
            minX = Math.min(minX, k.x); minY = Math.min(minY, k.y);
            maxX = Math.max(maxX, k.x + k.w); maxY = Math.max(maxY, k.y + k.h);
          }
          const dx = Math.max(0, up(ins.l + LANE_PAD - minX));
          const dy = Math.max(0, up(ins.t + LANE_PAD - minY));
          const w = Math.max(r.w + dx, up(maxX + dx + LANE_PAD));
          const h = Math.max(r.h + dy, up(maxY + dy + LANE_PAD));
          if (!dx && !dy && w === r.w && h === r.h) continue;
          setGeo(graph, lane, g => { g.x = r.x - dx; g.y = r.y - dy; g.width = w; g.height = h; });
          if (dx || dy) for (const k of childrenOf(lane)) if (k.isVertex()) setGeo(graph, k, g => { g.x += dx; g.y += dy; });
          changed.add(lane);
        }

        // B. corsie allineate restano allineate:
        //    orizzontali impilate → stessa x e larghezza; verticali affiancate → stessa y e altezza
        for (const lane of changed) {
          const old = this.before.get(lane.getId() ?? '');
          const now = rectOf(lane);
          const dir = dirOf(lane);
          if (!old) continue;
          const [pos, size, axis] = dir === 'h' ? (['x', 'w', 'x'] as const) : (['y', 'h', 'y'] as const);
          if (Math.abs(now[pos] - old[pos]) < 1 && Math.abs(now[size] - old[size]) < 1) continue;
          for (const mate of lanes) {
            if (mate === lane || moved.has(mate) || resized.has(mate) || dirOf(mate) !== dir) continue;
            const mb = this.before.get(mate.getId() ?? '');
            if (!mb || Math.abs(mb[pos] - old[pos]) > 1 || Math.abs(mb[size] - old[size]) > 1) continue;
            const shift = rectOf(mate)[pos] - now[pos];
            setGeo(graph, mate, g => {
              if (dir === 'h') { g.x = now.x; g.width = now.w; } else { g.y = now.y; g.height = now.h; }
            });
            if (shift) for (const k of childrenOf(mate)) if (k.isVertex()) setGeo(graph, k, g => { g[axis] += shift; });
          }
        }

        // C. corsie sovrapposte: le orizzontali scendono, le verticali vanno a destra
        const boxes = lanes.map(c => ({ c, r: rectOf(c), dir: dirOf(c) }));
        for (const i of resolveLaneOverlaps(boxes, LANE_GAP)) {
          const { c, r } = boxes[i];
          setGeo(graph, c, g => { g.x = r.x; g.y = r.y; });
        }
      });
    } finally {
      this.busy = false;
      this.remember();
    }
  }

  /** Adatta tutte le corsie al loro contenuto (pulsante) */
  fitAll(): void { this.normalize(this.ed.lanes(), 'add', true); }
}
