// =====================================================================
//  Disposizione delle corsie senza sovrapposizioni.
//  Corsie orizzontali: si impilano dall'alto in basso.
//  Corsie verticali tra loro: si affiancano da sinistra a destra.
//  Modulo puro, testabile senza maxGraph.
// =====================================================================
import type { LaneDir } from './styles';
import type { Rect } from './types';

export interface LaneBox { r: Rect; dir: LaneDir }

/**
 * Sposta le corsie che si sovrappongono (o sono più vicine di "gap"):
 * la corsia che viene dopo scende (orizzontali) o va a destra (verticali tra loro).
 * Modifica "items" e restituisce gli indici delle corsie spostate.
 */
export function resolveLaneOverlaps(items: LaneBox[], gap = 10): Set<number> {
  const moved = new Set<number>();
  const n = items.length;
  for (let guard = n * n + 10; guard > 0; guard--) {
    const order = items.map((_, i) => i).sort((a, b) => items[a].r.y - items[b].r.y || items[a].r.x - items[b].r.x);
    let fixed = false;
    search: for (let ii = 0; ii < n; ii++) {
      for (let jj = 0; jj < n; jj++) {
        if (ii === jj) continue;
        const i = order[ii], j = order[jj];
        const a = items[i].r, b = items[j].r;
        if (items[i].dir === 'v' && items[j].dir === 'v') {
          if (b.x < a.x || (b.x === a.x && jj < ii)) continue;          // b deve essere quella a destra
          const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
          if (overlapY && b.x < a.x + a.w + gap) { items[j].r = { ...b, x: a.x + a.w + gap }; moved.add(j); fixed = true; break search; }
        } else {
          if (b.y < a.y || (b.y === a.y && jj < ii)) continue;          // b deve essere quella sotto
          const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
          if (overlapX && b.y < a.y + a.h + gap) { items[j].r = { ...b, y: a.y + a.h + gap }; moved.add(j); fixed = true; break search; }
        }
      }
    }
    if (!fixed) break;
  }
  return moved;
}
