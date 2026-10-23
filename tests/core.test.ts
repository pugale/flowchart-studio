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
import { buildDiagramSummary } from '../src/core/summaryText';
import { LANE_PRESETS, NODE_DEFS, PRESETS } from '../src/core/styles';
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
    const { doc } = buildFlowDoc(parseFlowText('A? -[sì]-> B\nA? -[no]-> C\nA? -[positivo]-> D\nA? -[negativo]-> E'));
    expect(doc.edges.map(e => e.style.strokeColor)).toEqual(['#2e7d32', '#c0392b', '#2e7d32', '#c0392b']);
  });

  it('collega le sequenze e conserva i nodi ripetuti', () => {
    const p = parseFlowText('A -> B -> C\nA -> B');
    expect([p.nodes.map(n => n.text), p.edges.map(e => [e.from.text, e.to.text])]).toEqual([
      ['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]
    ]);
  });

  it('riconosce decisioni, inizi e fini impliciti', () => {
    const { doc } = buildFlowDoc(parseFlowText('Dati completi? -> Inizio -> Fine'));
    expect(doc.nodes.filter(n => n.type !== 'title').map(n => n.type)).toEqual(['decision', 'terminator', 'terminator']);
  });

  it('crea il banner del titolo', () => {
    const { doc } = buildFlowDoc(parseFlowText('titolo: Gestione richieste\nPasso'));
    expect(doc.nodes[0]).toMatchObject({ type: 'title', text: 'GESTIONE RICHIESTE' });
  });

  it('riconosce tutte le forme documentate', () => {
    const shapes = [
      ['processo', 'process'], ['attività', 'rounded'], ['inizio', 'terminator'], ['fine', 'terminator'],
      ['rombo', 'decision'], ['cerchio', 'circle'], ['ellisse', 'ellipse'], ['dati', 'data'],
      ['documento', 'document'], ['database', 'database'], ['preparazione', 'preparation'],
      ['sottoprocesso', 'subprocess'], ['nota', 'note']
    ] as const;
    const text = shapes.map(([shape], i) => `Passo ${i + 1} {${shape}}`).join('\n');
    const { doc, errors } = buildFlowDoc(parseFlowText(text));
    expect(errors).toEqual([]);
    expect(doc.nodes.map(n => n.type)).toEqual(shapes.map(([, type]) => type));
    expect(shapes.every(([, type]) => type in NODE_DEFS)).toBe(true);
  });

  it('applica le categorie predefinite e la legenda personalizzata', () => {
    const categories = ['auto', 'manuale', 'fascicolo', 'decisione', 'canale', 'ok', 'ko', 'neutro'];
    const { doc: builtins } = buildFlowDoc(parseFlowText(categories.map((category, i) => `Passo ${i + 1} {${category}}`).join('\n')));
    expect(builtins.nodes.map(n => n.style.fillColor)).toEqual(PRESETS.slice(0, 8).map(c => c.fill));
    const { doc, errors } = buildFlowDoc(parseFlowText(
      'categoria: personalizzata = Voce personalizzata #ffe6cc #123456\nAltro {personalizzata}'
    ));
    expect(errors).toEqual([]);
    expect(doc.nodes[0]?.style).toMatchObject({ fillColor: '#ffe6cc', strokeColor: '#123456' });
    expect(doc.legend.descriptions['#ffe6cc']).toBe('Voce personalizzata');
    const { doc: noColor } = buildFlowDoc(parseFlowText('categoria: senza = Voce senza colore\nPasso {senza}'));
    expect(Object.values(noColor.legend.descriptions)).toContain('Voce senza colore');
  });

  it('applica tutti i colori delle corsie e contiene i passi nella corsia corretta', () => {
    const text = LANE_PRESETS.map(lane => `[${lane.name}] {${lane.name.toLowerCase()}}\nPasso ${lane.name}`).join('\n');
    const { doc, errors } = buildFlowDoc(parseFlowText(text));
    expect(errors).toEqual([]);
    expect(doc.lanes.map(lane => lane.style.fillColor)).toEqual(LANE_PRESETS.map(lane => lane.header));
    expect(doc.nodes.map(node => node.parent)).toEqual(doc.lanes.map(lane => lane.id));
  });

  it('riutilizza le etichette uguali e permette forme distinte tramite alias', () => {
    const p = parseFlowText('X = Passo\nY = Passo\nX -> Y\nPrimo -> Secondo\nprimo -> Secondo');
    expect(p.nodes.map(n => n.text)).toEqual(['Passo', 'Passo', 'Primo', 'Secondo']);
    expect(p.edges).toHaveLength(2);
    expect(p.edges[0]?.from).not.toBe(p.edges[0]?.to);
  });

  it('segnala gli alias usati prima della dichiarazione e accetta quelli dichiarati prima', () => {
    const forward = parseFlowText('X -> B\nX = Passo\nB = Fine');
    expect(forward.errors).toEqual([
      'Riga 1: l\'alias "X" deve essere definito prima dell\'uso (riga 2)',
      'Riga 1: l\'alias "B" deve essere definito prima dell\'uso (riga 3)'
    ]);
    const declared = parseFlowText('X = Passo\nX -> Fine');
    expect(declared.errors).toEqual([]);
    expect(declared.edges.map(edge => [edge.from.text, edge.to.text])).toEqual([['Passo', 'Fine']]);
  });

  it('rifiuta alias duplicati senza distinzione tra maiuscole e minuscole', () => {
    const p = parseFlowText('X = Primo\nx = Secondo');
    expect(p.errors).toEqual(['Riga 2: l\'alias "x" è già stato usato']);
  });

  it('applica i commenti solo a inizio riga o dopo uno spazio e converte i ritorni a capo', () => {
    const p = parseFlowText('// riga ignorata\nA\\nB -> C // commento\nD//testo');
    expect(p.nodes.map(n => n.text)).toEqual(['A\nB', 'C', 'D//testo']);
    expect(p.edges).toHaveLength(1);
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

describe('testo riepilogativo', () => {
  it('riassume titolo, aree, passi e diramazioni mantenendo le etichette', () => {
    const { doc } = buildFlowDoc(parseFlowText(
      'titolo: Processo richiesta\n[Ingresso] {blu}\nRicezione -> Verifica?\n[Esito] {verde}\nVerifica? -[sì]-> Approvazione\nVerifica? -[no]-> Rifiuto'
    ));
    const summary = buildDiagramSummary(doc);
    expect(summary).toContain('PROCESSO RICHIESTA');
    expect(summary).toContain('Il diagramma descrive un processo con 4 passi e 3 collegamenti.');
    expect(summary).toContain('Area: Ingresso');
    expect(summary).toContain('Area: Esito');
    expect(summary).toContain('Verifica?');
    expect(summary).toContain('etichetta: sì');
    expect(summary).toContain('etichetta: no');
    expect(summary).toContain('Approvazione');
    expect(summary).toContain('Rifiuto');
  });

  it('indica i passi isolati e le frecce libere senza fingere collegamenti', () => {
    const { doc } = buildFlowDoc(parseFlowText('A -> B\nIsolato'));
    doc.edges.push({ id: 'free', source: null, target: null, label: 'nota', style: {} });
    const summary = buildDiagramSummary(doc);
    expect(summary).toContain('Isolato: non risulta collegato ad altri passi.');
    expect(summary).toContain('1 freccia libera o non collegata');
    expect(summary).toContain('1 collegamento.');
  });

  it('se il diagramma è vuoto restituisce un messaggio chiaro', () => {
    const { doc } = buildFlowDoc(parseFlowText('titolo: Vuoto'));
    expect(buildDiagramSummary(doc)).toBe('VUOTO\n\nIl diagramma è vuoto.');
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
