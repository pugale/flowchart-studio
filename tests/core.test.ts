// Test della logica pura (nessun browser richiesto): npm test
import { describe, expect, it } from 'vitest';
import { parseDocJson } from '../src/core/docIO';
import { resolveLaneOverlaps, type LaneBox } from '../src/core/laneStack';
import { layoutLegend } from '../src/core/legendLayout';
import {
  applyTextCase, arrowsOf, borderOf, dashOf, freeArrowStyle, laneDirOf, laneInset, laneStyle, routingOf,
  setArrows, setDash, setLaneDir, setRouting, swapEnds, textCaseOf, toHex
} from '../src/core/styles';
import { TEMPLATE_TEXT, buildFlowDoc, parseFlowText } from '../src/core/textImport';
import type { FlowDoc, Rect } from '../src/core/types';
import { backgroundFirst } from '../src/core/zorder';
import exampleJson from '../src/examples/canali-richiesta.json?raw';
import exampleText from '../src/examples/canali-richiesta.txt?raw';

const absNodes = (doc: FlowDoc) => {
  const lanes = new Map(doc.lanes.map(l => [l.id, l]));
  return doc.nodes.map(n => {
    const l = n.parent ? lanes.get(n.parent) : undefined;
    return { ...n, x: n.x + (l?.x ?? 0), y: n.y + (l?.y ?? 0) };
  });
};
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('import da testo', () => {
  it.each([['esempio breve', TEMPLATE_TEXT], ['Canali richiesta', exampleText]])('%s: impaginazione valida', (_n, text) => {
    const p = parseFlowText(text);
    expect(p.errors).toEqual([]);
    const { doc, errors } = buildFlowDoc(p);
    expect(errors).toEqual([]);
    const nodes = absNodes(doc).filter(n => n.type !== 'title');
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlap(nodes[i], nodes[j])).toBe(false);
    const lanes = new Map(doc.lanes.map(l => [l.id, l]));
    for (const n of doc.nodes) {
      const l = n.parent ? lanes.get(n.parent) : undefined;
      if (!l) continue;
      expect(n.x).toBeGreaterThanOrEqual(34);
      expect(n.x + n.w).toBeLessThanOrEqual(l.w);
      expect(n.y + n.h).toBeLessThanOrEqual(l.h);
    }
    const ids = new Set(doc.nodes.map(n => n.id));
    for (const e of doc.edges) { expect(ids.has(e.source!)).toBe(true); expect(ids.has(e.target!)).toBe(true); }
  });

  it('Canali richiesta: 25 forme, 27 collegamenti, 4 corsie, 7 voci di legenda', () => {
    const { doc } = buildFlowDoc(parseFlowText(exampleText));
    expect([doc.nodes.length, doc.edges.length, doc.lanes.length]).toEqual([25, 27, 4]);
    expect(Object.keys(doc.legend.descriptions)).toHaveLength(7);
  });

  it('colori delle frecce dalle etichette', () => {
    const { doc } = buildFlowDoc(parseFlowText('A? -[sì]-> B\nA? -[no]-> C\nB -> C'));
    expect(doc.edges.map(e => e.style.strokeColor)).toEqual(['#2e7d32', '#c0392b', '#5b6573']);
  });

  it('segnala gli errori con il numero di riga', () => {
    const p = parseFlowText('A -> \n[X] {fucsia}\nC -> C\nD {pippo}');
    const all = [...p.errors, ...buildFlowDoc(p).errors];
    expect(all.some(e => e.startsWith('Riga 1'))).toBe(true);
    expect(all.some(e => e.startsWith('Riga 2') && e.includes('fucsia'))).toBe(true);
    expect(all.some(e => e.startsWith('Riga 3'))).toBe(true);
    expect(all.some(e => e.startsWith('Riga 4') && e.includes('pippo'))).toBe(true);
  });

  it('i cicli non bloccano l\'impaginazione', () => {
    const { doc } = buildFlowDoc(parseFlowText('A -> B -> C -> A'));
    expect(doc.nodes).toHaveLength(3);
  });
});

describe('file JSON', () => {
  it('l\'esempio si legge e resta identico dopo salvataggio e riapertura', () => {
    const doc = parseDocJson(exampleJson);
    expect(doc.version).toBe(1);
    expect([doc.lanes.length, doc.nodes.length, doc.edges.length]).toEqual([4, 25, 27]);
    expect(parseDocJson(JSON.stringify(doc))).toEqual(doc);
  });

  it('completa i valori mancanti e scarta i collegamenti orfani', () => {
    const doc = parseDocJson(JSON.stringify({
      format: 'flowchart-studio', version: 1,
      lanes: [{ id: 'L', name: 'Corsia' }],
      nodes: [{ id: 'a', parent: 'L', type: 'decision' }, { id: 'b', parent: 'X', type: 'sconosciuto' }],
      edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'z' }]
    }));
    expect(doc.nodes[0]).toMatchObject({ parent: 'L', type: 'decision', w: 120 });
    expect(doc.nodes[1]).toMatchObject({ parent: null, type: 'process' });
    expect(doc.edges.map(e => e.id)).toEqual(['e1']);
    expect(doc.settings.gridSize).toBe(10);
    expect(laneDirOf(doc.lanes[0].style)).toBe('h');
  });

  it('frecce libere: estremi con punti, conservate dopo la riapertura', () => {
    const json = JSON.stringify({
      format: 'flowchart-studio', version: 1,
      nodes: [{ id: 'a' }],
      edges: [
        { id: 'free', source: null, target: null, sourcePoint: { x: 10, y: 20 }, targetPoint: { x: 170, y: 20 }, label: 'Nota' },
        { id: 'half', source: 'a', target: null, targetPoint: { x: 300, y: 40 } },
        { id: 'bad', source: null, target: null, sourcePoint: { x: 0, y: 0 } }
      ]
    });
    const doc = parseDocJson(json);
    expect(doc.edges.map(e => e.id)).toEqual(['free', 'half']);
    expect(doc.edges[0]).toMatchObject({ source: null, target: null, sourcePoint: { x: 10, y: 20 }, targetPoint: { x: 170, y: 20 }, label: 'Nota' });
    expect(doc.edges[1]).toMatchObject({ source: 'a', target: null, targetPoint: { x: 300, y: 40 } });
    expect(doc.edges[1].sourcePoint).toBeUndefined();
    expect(parseDocJson(JSON.stringify(doc))).toEqual(doc);
  });

  it('rifiuta file non validi', () => {
    expect(() => parseDocJson('[]')).toThrow();
    expect(() => parseDocJson('{"nodes":[]}')).toThrow();
    expect(() => parseDocJson('{"format":"flowchart-studio","version":99}')).toThrow();
  });
});

describe('stili', () => {
  it('impostazioni di linea reversibili', () => {
    const s = setDash(setArrows(setRouting({}, 'curved'), 'start'), 'dashed');
    expect([routingOf(s), arrowsOf(s), dashOf(s)]).toEqual(['curved', 'start', 'dashed']);
  });
  it('freccia libera: dritta, spessa, punta alla fine', () => {
    const s = freeArrowStyle();
    expect([routingOf(s), arrowsOf(s), s.strokeWidth]).toEqual(['straight', 'end', 3]);
  });
  it('bordi corsia', () => {
    for (const b of ['solid', 'dashed', 'dotted', 'dashdot', 'none'] as const) expect(borderOf(laneStyle({ borderType: b }))).toBe(b);
  });
  it('inversione ancoraggi', () => {
    expect(swapEnds({ exitX: 1, entryX: 0 })).toEqual({ exitX: 0, entryX: 1 });
  });
  it('colori', () => {
    expect(toHex('#AbC')).toBe('#aabbcc');
    expect(toHex('red')).toBe('#000000');
  });
});

describe('corsie orizzontali e verticali', () => {
  it('orizzontale: nome a sinistra; verticale: nome in alto', () => {
    const h = laneStyle(), v = laneStyle({ dir: 'v' });
    expect([laneDirOf(h), h.horizontal, laneInset(h)]).toEqual(['h', false, { l: 34, t: 0 }]);
    expect([laneDirOf(v), v.horizontal, laneInset(v)]).toEqual(['v', true, { l: 0, t: 34 }]);
  });
  it('cambio di orientamento', () => {
    const s = setLaneDir(laneStyle(), 'v');
    expect([laneDirOf(s), s.horizontal]).toEqual(['v', true]);
    expect(laneDirOf(setLaneDir(s, 'h'))).toBe('h');
  });
  it('orizzontali sovrapposte: quella sotto scende', () => {
    const b: LaneBox[] = [{ r: { x: 0, y: 0, w: 500, h: 250 }, dir: 'h' }, { r: { x: 0, y: 200, w: 500, h: 250 }, dir: 'h' }];
    expect([...resolveLaneOverlaps(b, 10)]).toEqual([1]);
    expect(b[1].r.y).toBe(260);
  });
  it('verticali sovrapposte: quella a destra si sposta a destra', () => {
    const b: LaneBox[] = [{ r: { x: 300, y: 0, w: 250, h: 500 }, dir: 'v' }, { r: { x: 0, y: 0, w: 250, h: 500 }, dir: 'v' }, { r: { x: 200, y: 50, w: 250, h: 500 }, dir: 'v' }];
    resolveLaneOverlaps(b, 10);
    expect(b.map(x => x.r.x)).toEqual([520, 0, 260]);
    expect(b.map(x => x.r.y)).toEqual([0, 0, 50]);
  });
  it('verticali affiancate senza sovrapposizione: nessuno spostamento', () => {
    const b: LaneBox[] = [{ r: { x: 0, y: 0, w: 250, h: 500 }, dir: 'v' }, { r: { x: 260, y: 0, w: 250, h: 500 }, dir: 'v' }];
    expect(resolveLaneOverlaps(b, 10).size).toBe(0);
  });
});

describe('ordine di disegno', () => {
  const isLane = (x: string) => x.startsWith('L');
  it('porta le corsie sotto a tutto mantenendo l\'ordine relativo', () => {
    expect(backgroundFirst(['n1', 'L1', 'e1', 'L2', 'n2'], isLane)).toEqual(['L1', 'L2', 'n1', 'e1', 'n2']);
  });
  it('non fa nulla se l\'ordine è già corretto', () => {
    expect(backgroundFirst(['L2', 'L1', 'n1', 'e1'], isLane)).toBeNull();
    expect(backgroundFirst(['n1', 'e1'], isLane)).toBeNull();
  });
});

describe('maiuscole / minuscole', () => {
  const t = 'VERIFICA della Documentazione\n(Solo AUTENTICATO)';
  it('tutto maiuscolo', () => expect(applyTextCase(t, 'upper')).toBe('VERIFICA DELLA DOCUMENTAZIONE\n(SOLO AUTENTICATO)'));
  it('tutto minuscolo', () => expect(applyTextCase(t, 'lower')).toBe('verifica della documentazione\n(solo autenticato)'));
  it('solo prima lettera maiuscola', () => {
    expect(applyTextCase(t, 'sentence')).toBe('Verifica della documentazione\n(solo autenticato)');
    expect(applyTextCase('(ÈSITO) OK', 'sentence')).toBe('(Èsito) ok');
    expect(applyTextCase('123', 'sentence')).toBe('123');
  });
  it('come scritto e valori non validi', () => {
    expect(applyTextCase(t, 'none')).toBe(t);
    expect(textCaseOf({ textCase: 'boh' })).toBe('none');
    expect(textCaseOf({ textCase: 'upper' })).toBe('upper');
  });
});

describe('legenda', () => {
  it('va a capo quando supera la larghezza', () => {
    const entries = ['#111111', '#222222', '#333333'].map(k => ({ key: k, fill: k, stroke: k, type: 'process' as const }));
    const lay = layoutLegend(entries, { w: 300, title: '', fontSize: 12, descriptions: { '#111111': 'Una descrizione abbastanza lunga' } }, t => t.length * 6.6);
    expect(new Set(lay.items.map(i => i.y)).size).toBeGreaterThan(1);
    expect(lay.items[1].empty).toBe(true);
  });
});
