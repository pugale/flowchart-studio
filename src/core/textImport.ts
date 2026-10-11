// =====================================================================
//  Import da testo: una descrizione scritta diventa un diagramma
//  con corsie, colori, legenda e impaginazione automatica.
//  Modulo puro (nessuna dipendenza da maxGraph): testabile in Node.
// =====================================================================
import { LANE_PRESETS, NODE_DEFS, PRESETS, darken, edgeStyle, isDark, laneStyle, nodeStyle } from './styles';
import type { Anchor, DocLane, NodeType } from './types';
import { emptyDoc, type FlowDoc } from './types';

const BUILTIN: Readonly<Record<string, number>> = {
  auto: 0, automatico: 0, sistema: 0, manuale: 1, operatore: 1, fascicolo: 2, decisione: 3, canale: 4,
  ok: 5, positivo: 5, elaborata: 5, ko: 6, negativo: 6, scartata: 6, neutro: 7
};
const SHAPE_WORDS: Readonly<Record<string, NodeType>> = {
  processo: 'process', attività: 'rounded', attivita: 'rounded', arrotondato: 'rounded',
  inizio: 'terminator', fine: 'terminator', terminale: 'terminator', rombo: 'decision',
  cerchio: 'circle', stato: 'circle', ellisse: 'ellipse', dati: 'data', input: 'data', output: 'data',
  documento: 'document', database: 'database', db: 'database', preparazione: 'preparation',
  sottoprocesso: 'subprocess', nota: 'note', 'input-manuale': 'manual'
};
const LANE_COLORS: Readonly<Record<string, number>> = Object.fromEntries(LANE_PRESETS.map((p, i) => [p.name.toLowerCase(), i]));
const ARROW = /\s*(?:-\[([^\]]*)\]->|->|→)\s*/;
const RED = /(^|\s)(no|ko)(\s|$)|negativ|scart|rifiut|respint|errore/i;
const GREEN = /(^|\s)(si|sì|ok)(\s|$)|positiv|approv|accolt|conferm/i;
const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const isHex = (s: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
const has = (o: object, k: string) => Object.hasOwn(o, k);

/* ---------------- Lettura ---------------- */
interface PLane { name: string; color: string }
interface PNode { key: string; text: string; lane: PLane | null; attrs: { a: string; ln: number }[] }
interface PEdge { from: PNode; to: PNode; label: string }
interface PCategory { desc: string; fill?: string; stroke?: string }

export interface ParsedFlow {
  title: string;
  categories: Record<string, PCategory>;
  catOrder: string[];
  lanes: PLane[];
  nodes: PNode[];
  edges: PEdge[];
  errors: string[];
}

function splitToken(token: string) {
  const m = token.match(/^(.*?)\s*(?:\{([^}]*)\})?\s*$/) ?? [];
  return {
    name: (m[1] ?? '').trim(),
    attrs: m[2] ? m[2].split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean) : []
  };
}

export function parseFlowText(text: string): ParsedFlow {
  const res: ParsedFlow = { title: '', categories: {}, catOrder: [], lanes: [], nodes: [], edges: [], errors: [] };
  const byKey = new Map<string, PNode>();
  const byAlias = new Map<string, PNode>();
  const edgeKeys = new Set<string>();
  let lane: PLane | null = null;

  const create = (name: string): PNode => {
    const node: PNode = { key: 'n' + (res.nodes.length + 1), text: name.replace(/\\n/g, '\n'), lane, attrs: [] };
    res.nodes.push(node);
    if (!byKey.has(norm(name))) byKey.set(norm(name), node);
    return node;
  };
  const ensure = (token: string, ln: number): PNode | null => {
    const { name, attrs } = splitToken(token);
    if (!name) { res.errors.push(`Riga ${ln}: manca il nome di un passo`); return null; }
    const node = byAlias.get(name.toLowerCase()) ?? byKey.get(norm(name)) ?? create(name);
    for (const a of attrs) node.attrs.push({ a, ln });
    return node;
  };

  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const ln = i + 1;
    const line = raw.replace(/(^|\s)\/\/.*$/, '').trim();
    if (!line) return;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^titolo\s*:\s*(.+)$/i))) { res.title = m[1].trim(); return; }

    if ((m = line.match(/^categoria\s*:\s*([^=]+?)\s*=\s*(.*)$/i))) {
      const key = m[1].trim().toLowerCase();
      const hex = m[2].match(HEX) ?? [];
      res.categories[key] = { desc: m[2].replace(HEX, '').trim(), fill: hex[0], stroke: hex[1] };
      if (!res.catOrder.includes(key)) res.catOrder.push(key);
      return;
    }

    if ((m = line.match(/^\[(.+?)\]\s*(?:\{([^}]*)\})?$/))) {
      lane = { name: m[1].trim(), color: (m[2] ?? '').trim().toLowerCase() };
      if (lane.color && !has(LANE_COLORS, lane.color)) {
        res.errors.push(`Riga ${ln}: colore corsia "${lane.color}" non riconosciuto (usa: ${Object.keys(LANE_COLORS).join(', ')})`);
      }
      res.lanes.push(lane);
      return;
    }

    const parts = line.split(ARROW);
    if (parts.length === 1) {
      if ((m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/))) {
        const alias = m[1].toLowerCase();
        if (byAlias.has(alias)) { res.errors.push(`Riga ${ln}: l'alias "${m[1]}" è già stato usato`); return; }
        const { name, attrs } = splitToken(m[2]);
        if (!name) { res.errors.push(`Riga ${ln}: testo mancante per l'alias "${m[1]}"`); return; }
        const node = create(name);
        for (const a of attrs) node.attrs.push({ a, ln });
        byAlias.set(alias, node);
        return;
      }
      ensure(line, ln);
      return;
    }

    // Catena A -> B -[etichetta]-> C : split restituisce [A, label?, B, label?, C]
    const chain: (PNode | null)[] = [];
    for (let k = 0; k < parts.length; k += 2) chain.push(ensure(parts[k] ?? '', ln));
    for (let k = 0; k < chain.length - 1; k++) {
      const from = chain[k], to = chain[k + 1];
      if (!from || !to) continue;
      if (from === to) { res.errors.push(`Riga ${ln}: un passo non può collegarsi a se stesso`); continue; }
      const label = (parts[2 * k + 1] ?? '').trim().replace(/\\n/g, '\n');
      const key = `${from.key}>${to.key}>${label}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      res.edges.push({ from, to, label });
    }
  });
  return res;
}

/* ---------------- Costruzione e impaginazione ---------------- */
const L = { COLW: 210, COLGAP: 110, ROWGAP: 50, PAD: 30, LANEGAP: 10, BAND: 34 } as const;
const STEP = L.COLW + L.COLGAP;
const WIDE: ReadonlySet<NodeType> = new Set(['rounded', 'process', 'subprocess', 'data', 'document', 'preparation', 'manual', 'terminator', 'note']);

interface Cat { fill: string; stroke: string; desc: string; decision: boolean }
interface Info { type: NodeType; fill: string; stroke: string }

export interface BuildResult { doc: FlowDoc; errors: string[] }

export function buildFlowDoc(p: ParsedFlow, idPrefix = ''): BuildResult {
  const errors: string[] = [];
  const doc = emptyDoc();

  /* 1. Categorie -> colori e descrizioni della legenda */
  const catCache = new Map<string, Cat>();
  const usedFills = new Set<string>();
  let autoIdx = 0;
  const resolveCat = (key: string): Cat => {
    const cached = catCache.get(key);
    if (cached) return cached;
    const custom = p.categories[key];
    const bi = has(BUILTIN, key) ? BUILTIN[key] : undefined;
    let base: { fill: string; stroke: string };
    if (bi !== undefined) base = PRESETS[bi];
    else if (custom?.fill) base = { fill: custom.fill, stroke: custom.stroke ?? darken(custom.fill) };
    else {
      while (autoIdx < PRESETS.length && usedFills.has(PRESETS[autoIdx].fill)) autoIdx++;
      base = PRESETS[autoIdx++ % PRESETS.length];
    }
    const c: Cat = {
      fill: custom?.fill ?? base.fill,
      stroke: custom?.stroke ?? (custom?.fill ? darken(custom.fill) : base.stroke),
      desc: custom?.desc || (bi !== undefined ? PRESETS[bi].name : key),
      decision: key === 'decisione' || bi === 3
    };
    usedFills.add(c.fill);
    catCache.set(key, c);
    return c;
  };
  p.catOrder.forEach(resolveCat);

  const descriptions: Record<string, string> = {};
  const info = new Map<PNode, Info>();
  for (const n of p.nodes) {
    let type: NodeType | null = null, cat: string | null = null, fill: string | null = null;
    for (const { a, ln } of n.attrs) {
      if (has(SHAPE_WORDS, a)) type = SHAPE_WORDS[a];
      else if (has(p.categories, a) || has(BUILTIN, a)) cat = a;
      else if (isHex(a)) fill = a;
      else errors.push(`Riga ${ln}: "${a}" non è né una forma né una categoria`);
    }
    const c = cat ? resolveCat(cat) : null;
    type ??= /\?\s*$/.test(n.text) || c?.decision ? 'decision'
      : /^(inizio|fine|start|end|stop)\b/i.test(n.text) ? 'terminator' : 'rounded';

    let colors: { fill: string; stroke: string };
    if (fill) colors = { fill, stroke: darken(fill) };
    else if (c) { colors = c; descriptions[c.fill.toLowerCase()] = c.desc; }
    else if (type === 'decision') { const d = resolveCat('decisione'); colors = d; descriptions[d.fill.toLowerCase()] = d.desc; }
    else { colors = PRESETS[7]; descriptions[colors.fill] ??= 'Altro'; }
    info.set(n, { type, fill: colors.fill, stroke: colors.stroke });
  }

  /* 2. Righe (livelli) rispettando l'ordine delle corsie */
  const laneIndex = new Map(p.lanes.map((l, i) => [l, i]));
  const laneOfNode = (n: PNode) => (n.lane ? laneIndex.get(n.lane) ?? -1 : -1);
  const out = new Map<PNode, PEdge[]>(p.nodes.map(n => [n, []]));
  const inn = new Map<PNode, PEdge[]>(p.nodes.map(n => [n, []]));
  for (const e of p.edges) { out.get(e.from)!.push(e); inn.get(e.to)!.push(e); }

  // archi all'indietro (cicli) individuati con una visita in profondità iterativa
  const back = new Set<PEdge>();
  const state = new Map<PNode, 1 | 2>();
  for (const root of p.nodes) {
    if (state.has(root)) continue;
    const stack: { n: PNode; i: number }[] = [{ n: root, i: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const edges = out.get(top.n)!;
      if (top.i >= edges.length) { state.set(top.n, 2); stack.pop(); continue; }
      const e = edges[top.i++];
      const s = state.get(e.to);
      if (s === 1) back.add(e);
      else if (!s) { state.set(e.to, 1); stack.push({ n: e.to, i: 0 }); }
    }
  }
  const fwd = (e: PEdge) => !back.has(e) && laneOfNode(e.from) <= laneOfNode(e.to);

  const laneOrder = [...(p.nodes.some(n => !n.lane) ? [-1] : []), ...p.lanes.map((_, i) => i)];
  const rank = new Map<PNode, number>();
  const laneRanks: { li: number; min: number; max: number }[] = [];
  let next = 0;
  for (const li of laneOrder) {
    const ns = p.nodes.filter(n => laneOfNode(n) === li);
    const min = next;
    const indeg = new Map(ns.map(n => [n, inn.get(n)!.filter(e => fwd(e) && laneOfNode(e.from) === li).length]));
    const queue = ns.filter(n => indeg.get(n) === 0);
    for (let qi = 0; qi < queue.length; qi++) {
      const n = queue[qi];
      let r = min;
      for (const e of inn.get(n)!) if (fwd(e) && rank.has(e.from)) r = Math.max(r, rank.get(e.from)! + 1);
      rank.set(n, r);
      for (const e of out.get(n)!) {
        if (!fwd(e) || laneOfNode(e.to) !== li) continue;
        const d = indeg.get(e.to)! - 1;
        indeg.set(e.to, d);
        if (d === 0) queue.push(e.to);
      }
    }
    const max = ns.reduce((m, n) => Math.max(m, rank.get(n) ?? min), min);
    laneRanks.push({ li, min, max });
    next = max + 1;
  }
  const maxRank = next - 1;
  const byRank: PNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of p.nodes) byRank[rank.get(n)!].push(n);

  /* 3. Colonne: il primo ramo resta sotto, gli altri si aprono ai lati */
  const offset = new Map<PEdge, number>();
  for (const n of p.nodes) {
    out.get(n)!.filter(e => fwd(e) && rank.get(e.to)! > rank.get(n)!)
      .forEach((e, i) => offset.set(e, i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -i / 2));
  }
  const col = new Map<PNode, number>();
  for (const ns of byRank) {
    const withD: { n: PNode; d: number }[] = [];
    const noD: PNode[] = [];
    for (const n of ns) {
      const props = inn.get(n)!.filter(e => fwd(e) && col.has(e.from)).map(e => col.get(e.from)! + (offset.get(e) ?? 0));
      if (props.length) withD.push({ n, d: props.reduce((a, b) => a + b, 0) / props.length });
      else noD.push(n);
    }
    withD.sort((a, b) => a.d - b.d);
    let last = -Infinity;
    for (const { n, d } of withD) { last = Math.max(Math.round(d), last + 1); col.set(n, last); }
    for (const n of noD) { last = last === -Infinity ? 0 : last + 1; col.set(n, last); }
  }
  const cols = [...col.values()];
  const minCol = cols.length ? Math.min(...cols) : 0;
  const ncols = cols.length ? Math.max(...cols) - minCol + 1 : 1;

  /* 4. Coordinate */
  const x0 = p.lanes.length ? L.BAND + 40 : 20;
  const width = Math.max(600, x0 + ncols * STEP - L.COLGAP + 40);
  const sizeOf = (n: PNode) => {
    const t = info.get(n)!.type;
    return { w: WIDE.has(t) ? L.COLW : NODE_DEFS[t].w, h: NODE_DEFS[t].h };
  };
  const rankH = byRank.map(ns => (ns.length ? Math.max(...ns.map(n => sizeOf(n).h)) : 60));

  let y = 0;
  if (p.title) {
    doc.nodes.push({
      id: idPrefix + 'title', parent: null, type: 'title', x: 0, y: 0, w: width, h: 50,
      text: p.title.toUpperCase(), inLegend: false, style: nodeStyle('title')
    });
    y = 62;
  }
  const legendY = y;
  const descList = Object.values(descriptions);
  if (descList.length) {
    let x = 12, rows = 1;
    for (const d of descList) {
      const w = 68 + d.length * 6.2;
      if (x > 12 && x + w > width - 12) { rows++; x = 12; }
      x += w;
    }
    y += rows * 28 + 30;
  }

  const rowTop: number[] = [];
  const laneDoc = new Map<number, DocLane>();
  for (const lr of laneRanks) {
    const top = y;
    y += L.PAD;
    for (let r = lr.min; r <= lr.max; r++) { rowTop[r] = y; y += rankH[r] + L.ROWGAP; }
    y += L.PAD - L.ROWGAP;
    if (lr.li >= 0) {
      const lane = p.lanes[lr.li];
      const preset = LANE_PRESETS[has(LANE_COLORS, lane.color) ? LANE_COLORS[lane.color] : lr.li % LANE_PRESETS.length];
      const dl: DocLane = {
        id: `${idPrefix}lane${lr.li + 1}`, name: lane.name, x: 0, y: top, w: width, h: y - top,
        style: laneStyle({ header: preset.header, body: preset.body, border: preset.border })
      };
      doc.lanes.push(dl);
      laneDoc.set(lr.li, dl);
    }
    y += L.LANEGAP;
  }

  const idOf = new Map<PNode, string>();
  for (const n of p.nodes) {
    const it = info.get(n)!, sz = sizeOf(n), r = rank.get(n)!;
    const cx = x0 + (col.get(n)! - minCol) * STEP + L.COLW / 2;
    const absX = Math.round(cx - sz.w / 2), absY = Math.round(rowTop[r] + (rankH[r] - sz.h) / 2);
    const lane = laneDoc.get(laneOfNode(n)) ?? null;
    const strong = it.type === 'circle' || it.type === 'decision' || it.type === 'terminator';
    const id = idPrefix + n.key;
    doc.nodes.push({
      id, parent: lane?.id ?? null, type: it.type,
      x: absX - (lane?.x ?? 0), y: absY - (lane?.y ?? 0), w: sz.w, h: sz.h,
      text: n.text, inLegend: true,
      style: nodeStyle(it.type, {
        fill: it.fill, stroke: it.stroke,
        fontColor: it.type === 'circle' ? it.stroke : isDark(it.fill) ? '#ffffff' : undefined,
        bold: strong || undefined
      })
    });
    idOf.set(n, id);
  }

  /* 5. Collegamenti con ancoraggi scelti in base alla posizione */
  p.edges.forEach((e, i) => {
    const ra = rank.get(e.from)!, rb = rank.get(e.to)!, ca = col.get(e.from)!, cb = col.get(e.to)!;
    let a: Anchor, b: Anchor;
    if (rb > ra) {
      a = ca !== cb && info.get(e.from)!.type === 'decision' ? (cb > ca ? 'r' : 'l') : 'b';
      b = 't';
    } else if (rb === ra) { a = cb > ca ? 'r' : 'l'; b = cb > ca ? 'l' : 'r'; }
    else if (ca === cb) { a = 'r'; b = 'r'; }
    else { a = cb > ca ? 'r' : 'l'; b = 'b'; }
    const color = RED.test(e.label) ? '#c0392b' : GREEN.test(e.label) ? '#2e7d32' : '#5b6573';
    doc.edges.push({
      id: `${idPrefix}e${i + 1}`, source: idOf.get(e.from)!, target: idOf.get(e.to)!, label: e.label,
      style: edgeStyle({ color, from: a, to: b })
    });
  });

  doc.name = p.title ? p.title.toLowerCase().replace(/[^a-z0-9àèéìòù]+/gi, '-').replace(/^-|-$/g, '') || 'diagramma' : 'diagramma';
  Object.assign(doc.legend, { visible: true, x: 0, y: legendY, w: width, title: '', fontSize: 11, descriptions });
  return { doc, errors };
}

/* ---------------- Testo di esempio ---------------- */
export const TEMPLATE_TEXT = `titolo: Gestione richiesta

// Categorie = colori della legenda
categoria: auto = Automatico (sistema)
categoria: manuale = Operatore (manuale)

[1 · Ricezione] {blu}
Inizio -> Ricezione richiesta {manuale} -> Registrazione automatica {auto}

[2 · Verifica] {grigio}
Registrazione automatica -> Documenti completi?
Documenti completi? -[sì]-> Istruttoria {manuale}
Documenti completi? -[no]-> Richiesta integrazione {auto} -> Ricezione richiesta

[3 · Chiusura] {verde}
Istruttoria -> Esito positivo?
Esito positivo? -[sì]-> Emissione provvedimento {auto} -> Fine {ok, cerchio}
Esito positivo? -[no]-> Comunicazione rigetto {auto} -> Fine
`;
