// =====================================================================
//  Pannello proprietà (destra) e pannello legenda.
//  Il pannello si ridisegna solo se il suo contenuto cambia davvero.
// =====================================================================
import type { Cell } from '@maxgraph/core';
import {
  EDGE_COLORS, FONTS, LANE_PRESETS, NODE_DEFS, PALETTE_ORDER, PRESETS, TEXT_CASES, BAND_SIZE,
  applyBorder, arrowsOf, borderOf, dashOf, laneDirOf, routingOf, setArrows, setDash, setRouting, showsBand, swapEnds, textCaseOf,
  type ArrowMode, type LaneDir, type LineDash, type Routing
} from '../core/styles';
import type { BorderType, NodeType } from '../core/types';
import { isFreeEdge, styleOf } from '../editor/cells';
import type { AlignKind, FlowEditor } from '../editor/FlowEditor';
import { $, esc, fArea, fChk, fColor, fNum, fSel, fText, readInput, row2, type Field } from './dom';

type Value = string | number | boolean;
interface Targets { nodes: Cell[]; lanes: Cell[]; edges: Cell[]; legend: boolean }

/** Campi di testo aggiornati mentre si scrive (non solo all'uscita dal campo) */
const LIVE_TEXT = new Set(['node:text', 'lane:name', 'edge:label']);
const LIVE_DELAY = 250;

const ALIGN_BTNS: readonly [AlignKind, string][] = [
  ['left', '⇤ Sinistra'], ['center', '↔ Centro'], ['right', '⇥ Destra'],
  ['top', '⤒ Alto'], ['middle', '↕ Metà'], ['bottom', '⤓ Basso']
];
const TYPE_OPTS = PALETTE_ORDER.map(t => [t, NODE_DEFS[t].label] as const);
const LANE_DIRS: readonly (readonly [LaneDir, string])[] = [
  ['h', 'Orizzontale (nome a sinistra)'],
  ['v', 'Verticale (nome in alto)']
];

export class PropertiesPanel {
  private readonly root = $('#props');
  private readonly body = $('#props-body');
  private readonly legendBox = $('#legend-panel');
  private bodyHtml = '';
  private legendSig = '';
  /**
   * Elementi a cui si riferisce il pannello, fissati quando il pannello viene disegnato.
   * Così una modifica va sempre all'elemento mostrato, anche se nel frattempo
   * si è cliccato su un'altra forma.
   */
  private targets: Targets = { nodes: [], lanes: [], edges: [], legend: false };
  private liveTimer = 0;
  private liveField: Field | null = null;

  constructor(private readonly ed: FlowEditor) {
    this.root.addEventListener('change', ev => this.onChange(ev.target as Field));
    this.root.addEventListener('input', ev => {
      const el = ev.target as Field;
      // descrizioni della legenda: subito
      if (el.dataset.scope === 'desc') { this.ed.legendDescription(el.dataset.k ?? '', el.value); return; }
      // testo di forme, corsie e frecce: aggiornato mentre scrivi (raggruppato ogni 250 ms)
      if (LIVE_TEXT.has(`${el.dataset.scope}:${el.dataset.k}`)) {
        clearTimeout(this.liveTimer);
        this.liveField = el;
        this.liveTimer = window.setTimeout(() => this.flushLive(), LIVE_DELAY);
      }
    });
    // uscendo dal campo il testo in sospeso viene applicato subito
    this.root.addEventListener('focusout', () => this.flushLive());
  }

  private flushLive(): void {
    clearTimeout(this.liveTimer);
    const el = this.liveField;
    this.liveField = null;
    if (el) this.onChange(el);
  }

  private sel(): Targets {
    const cells = this.ed.graph.getSelectionCells();
    return {
      nodes: cells.filter(c => this.ed.isNode(c)),
      lanes: cells.filter(c => this.ed.isLane(c)),
      edges: cells.filter(c => c.isEdge()),
      legend: cells.some(c => this.ed.isLegend(c))
    };
  }

  /** Ridisegna il pannello (salta se si sta scrivendo in un campo del pannello) */
  refresh(force = false): void {
    const focused = document.activeElement;
    if (!force && focused && this.root.contains(focused) && focused.matches('input,textarea,select')) return;
    if (force) { this.flushLive(); this.legendSig = ''; }
    const s = this.sel();
    this.targets = s;
    let h = '';
    if (s.nodes.length) h += this.nodePanel(s.nodes);
    if (s.lanes.length) h += this.lanePanel(s.lanes);
    if (s.edges.length) h += this.edgePanel(s.edges);
    if (s.legend) h += `<h3>Legenda</h3><p class="muted">Trascinala per spostarla. Le descrizioni si scrivono nel riquadro "Legenda" qui sotto.</p>`;
    h ||= this.diagramPanel();
    if (h !== this.bodyHtml) { this.body.innerHTML = h; this.bodyHtml = h; }
    this.refreshLegend();
  }

  /* ---------------- Sezioni ---------------- */
  private nodePanel(nodes: Cell[]): string {
    const ed = this.ed, n = nodes[0], st = styleOf(n), multi = nodes.length > 1;
    const type = ed.typeOf(n), isText = nodes.every(c => ed.typeOf(c) === 'text');
    const fs = Number(st.fontStyle ?? 0);
    let h = `<h3>${multi ? nodes.length + ' forme selezionate' : esc(NODE_DEFS[type].label)}</h3>`;
    if (!multi) {
      h += fSel('node', 'type', 'Tipo forma', type, TYPE_OPTS);
      h += fArea('node', 'text', 'Testo (si aggiorna mentre scrivi · Invio = a capo)', n.getValue());
    }
    if (!isText) {
      h += `<div class="f col"><span>Colori rapidi</span><div class="swatches">${PRESETS.map(p =>
        `<button class="sw" title="${esc(p.name)}" data-action="nodePreset" data-fill="${p.fill}" data-stroke="${p.stroke}" style="background:${p.fill};border-color:${p.stroke}"></button>`).join('')}</div></div>`;
      h += row2(fColor('node', 'fillColor', 'Sfondo', st.fillColor), fColor('node', 'strokeColor', 'Bordo', st.strokeColor));
      h += fNum('node', 'strokeWidth', 'Spessore bordo', st.strokeWidth ?? 1.5, 0, 10, 0.5);
    }
    h += '<h4>Testo</h4>';
    h += fSel('node', 'fontFamily', 'Font', st.fontFamily ?? 'Arial', FONTS.map(f => [f, f] as const));
    h += row2(fNum('node', 'fontSize', 'Dimensione', st.fontSize ?? 12, 6, 120), fColor('node', 'fontColor', 'Colore', st.fontColor ?? '#333333'));
    h += row2(fChk('node', 'bold', 'Grassetto', fs & 1), fChk('node', 'italic', 'Corsivo', fs & 2));
    h += fSel('node', 'textCase', 'Maiuscole / minuscole', textCaseOf(st), TEXT_CASES);
    h += fSel('node', 'align', 'Allineamento', st.align ?? 'center', [['left', 'Sinistra'], ['center', 'Centro'], ['right', 'Destra']]);
    if (!multi) {
      const g = n.getGeometry();
      h += '<h4>Dimensioni</h4>' + row2(fNum('node', 'w', 'Larghezza', g?.width, 10, 5000), fNum('node', 'h', 'Altezza', g?.height, 10, 5000));
    }
    if (!isText) h += fChk('node', 'inLegend', 'Includi nella legenda', ed.isInLegend(n));
    if (multi) {
      h += `<h4>Allinea e distribuisci</h4><div class="btns grid3">${ALIGN_BTNS.map(([a, l]) =>
        `<button data-action="align" data-a="${a}">${l}</button>`).join('')}
        <button data-action="distH">Distribuisci ↔</button><button data-action="distV">Distribuisci ↕</button></div>`;
    }
    h += `<div class="btns"><button data-action="front">Porta in primo piano</button><button data-action="back">Porta in fondo</button></div>`;
    h += `<div class="btns"><button data-action="group">Crea corsia</button><button class="danger" data-action="delete">Elimina</button></div>`;
    return h;
  }

  private lanePanel(lanes: Cell[]): string {
    const l = lanes[0], st = styleOf(l), multi = lanes.length > 1;
    let h = `<h3>${multi ? lanes.length + ' corsie' : 'Corsia / gruppo'}</h3>`;
    if (!multi) h += fText('lane', 'name', 'Nome', l.getValue());
    h += fSel('lane', 'dir', 'Orientamento', laneDirOf(st), LANE_DIRS);
    h += `<div class="f col"><span>Stili rapidi</span><div class="swatches">${LANE_PRESETS.map((p, i) =>
      `<button class="sw" title="${p.name}" data-action="lanePreset" data-i="${i}" style="background:linear-gradient(90deg, ${p.header} 0 32%, ${p.body} 32% 100%);border-color:${p.border}"></button>`).join('')}</div></div>`;
    h += row2(fColor('lane', 'swimlaneFillColor', 'Sfondo', st.swimlaneFillColor), fColor('lane', 'fillColor', 'Colore banda', st.fillColor));
    h += '<h4>Nome</h4>' + fChk('lane', 'band', 'Mostra la banda con il nome', showsBand(st));
    h += row2(fColor('lane', 'fontColor', 'Colore testo', st.fontColor), fNum('lane', 'fontSize', 'Dim. testo', st.fontSize ?? 12, 8, 60));
    h += fNum('lane', 'startSize', 'Spessore banda', st.startSize ?? BAND_SIZE, 16, 120);
    h += '<h4>Bordo</h4>' + fSel('lane', 'border', 'Tipo di bordo', borderOf(st), [['solid', 'Continuo'], ['dashed', 'Tratteggiato'], ['dotted', 'Puntinato'], ['dashdot', 'Tratto-punto'], ['none', 'Nessuno']]);
    h += row2(fColor('lane', 'strokeColor', 'Colore', st.strokeColor), fNum('lane', 'strokeWidth', 'Spessore', st.strokeWidth ?? 1, 0.5, 10, 0.5));
    h += `<p class="muted">Trascina la corsia dalla banda colorata: le forme dentro si spostano con lei. Le corsie restano sempre sotto forme e frecce.</p>`;
    h += `<div class="btns"><button data-action="fitLanes">Adatta corsie al contenuto</button></div>`;
    h += `<div class="btns"><button data-action="ungroup">Separa (mantieni forme)</button><button class="danger" data-action="delete">Elimina con contenuto</button></div>`;
    return h;
  }

  private edgePanel(edges: Cell[]): string {
    const e = edges[0], st = styleOf(e), multi = edges.length > 1;
    const free = edges.every(isFreeEdge);
    const title = multi ? `${edges.length} ${free ? 'frecce libere' : 'collegamenti'}` : free ? 'Freccia libera' : 'Collegamento';
    let h = `<h3>${title}</h3>`;
    if (free) h += `<p class="muted">Trascina la freccia per spostarla; trascina le sue estremità per allungarla o ruotarla.</p>`;
    if (!multi) h += fArea('edge', 'label', 'Etichetta (trascinala per spostarla)', e.getValue());
    h += `<div class="f col"><span>Colori rapidi</span><div class="swatches">${EDGE_COLORS.map(c =>
      `<button class="sw round" data-action="edgeColor" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>`;
    h += row2(fColor('edge', 'strokeColor', 'Colore linea', st.strokeColor ?? '#5b6573'), fNum('edge', 'strokeWidth', 'Spessore', st.strokeWidth ?? 1.5, 0.5, 10, 0.5));
    h += fSel('edge', 'dash', 'Stile linea', dashOf(st), [['solid', 'Continua'], ['dashed', 'Tratteggiata'], ['dotted', 'Puntinata']]);
    h += fSel('edge', 'routing', 'Percorso', routingOf(st), [['orthogonal', 'Ortogonale (a gomito)'], ['straight', 'Diritto'], ['curved', 'Curvo']]);
    h += fSel('edge', 'arrow', 'Punte', arrowsOf(st), [['end', 'Alla fine'], ['start', "All'inizio"], ['both', 'Entrambe'], ['none', 'Nessuna']]);
    h += row2(fColor('edge', 'fontColor', 'Colore etichetta', st.fontColor ?? st.strokeColor), fNum('edge', 'fontSize', 'Dim. etichetta', st.fontSize ?? 10, 6, 40));
    h += `<div class="btns"><button data-action="invertEdge">Inverti direzione</button><button data-action="resetLabel">Centra etichetta</button></div>`;
    h += `<div class="btns"><button class="danger" data-action="delete">Elimina</button></div>`;
    return h;
  }

  private diagramPanel(): string {
    const s = this.ed.meta.settings;
    return `<h3>Diagramma</h3>
      ${fText('meta', 'name', 'Nome (usato per i file)', this.ed.meta.name)}
      ${fColor('settings', 'background', 'Colore sfondo dashboard', s.background)}
      ${fChk('settings', 'grid', 'Mostra griglia', s.grid)}
      ${fChk('settings', 'snap', 'Aggancia alla griglia', s.snap)}
      ${fChk('settings', 'autoGrow', 'Allarga le corsie automaticamente', s.autoGrow)}
      ${fSel('settings', 'pdfFormat', 'Formato PDF', s.pdfFormat, [['fit', 'Adatta al diagramma'], ['a4', 'A4'], ['a3', 'A3']])}
      <div class="btns"><button data-action="fitLanes">Adatta corsie</button><button data-action="openImport">✎ Crea da testo</button></div>
      <h4>Come si usa</h4>
      <ul class="tips">
        <li>Trascina una forma dalla palette nella dashboard (anche dentro una corsia)</li>
        <li>Passa sopra una forma: trascina da un <b>punto blu</b> verso un'altra forma per collegarle</li>
        <li>Rilascia il collegamento nel vuoto per creare subito una nuova forma collegata</li>
        <li><b>Freccia libera</b> (palette): spostala trascinandola, allungala o ruotala dalle estremità</li>
        <li><b>Corsie</b> orizzontali o verticali: l'orientamento si cambia anche dopo, da questo pannello</li>
        <li><b>Doppio clic</b> su forma, freccia o corsia per scrivere; nel vuoto crea un testo</li>
        <li>I pulsanti <b>◧</b> e <b>◨</b> in alto nascondono la palette e questo pannello</li>
        <li><b>?</b> o <b>F1</b> aprono il manuale</li>
      </ul>`;
  }

  private refreshLegend(): void {
    const entries = this.ed.legend.entries();
    const L = this.ed.meta.legend;
    // le descrizioni restano fuori dalla firma: altrimenti il campo perderebbe il cursore mentre scrivi
    const sig = JSON.stringify([entries, L.visible, L.title, L.w, L.fontSize, L.fill, L.stroke]);
    if (sig === this.legendSig) return;
    this.legendSig = sig;
    let h = `<h3>Legenda</h3>${fChk('legend', 'visible', 'Mostra legenda nella dashboard', L.visible)}`;
    h += fText('legend', 'title', 'Titolo (vuoto = nessun titolo)', L.title);
    h += row2(fNum('legend', 'w', 'Larghezza', L.w, 150, 5000, 10), fNum('legend', 'fontSize', 'Dim. testo', L.fontSize, 8, 40));
    h += row2(fColor('legend', 'fill', 'Sfondo', L.fill), fColor('legend', 'stroke', 'Bordo', L.stroke));
    h += entries.length
      ? '<div class="legend-list">' + entries.map(e =>
        `<div class="lg-row"><span class="lg-sw" style="background:${e.fill};border-color:${e.stroke};border-radius:${e.type === 'circle' ? '50%' : '3px'}"></span>` +
        `<input type="text" data-scope="desc" data-k="${esc(e.key)}" value="${esc(L.descriptions[e.key] ?? '')}" placeholder="Descrizione colore ${esc(e.key)}"></div>`).join('') + '</div>'
      : `<p class="muted">La legenda si compila da sola: ogni colore di sfondo usato diventa una voce.</p>`;
    this.legendBox.innerHTML = h;
  }

  /* ---------------- Applicazione delle modifiche ---------------- */
  private onChange(el: Field): void {
    const { scope, k } = el.dataset;
    if (!scope || !k || scope === 'desc') return;
    const v = readInput(el);
    if (typeof v === 'number' && Number.isNaN(v)) return;
    const ed = this.ed, s = this.targets;
    switch (scope) {
      case 'node': this.applyNode(s.nodes, k, v); break;
      case 'lane': this.applyLane(s.lanes, k, v); break;
      case 'edge': this.applyEdge(s.edges, k, v); break;
      case 'settings': Object.assign(ed.meta.settings, { [k]: v }); ed.applySettings(); syncToolbar(ed); break;
      case 'meta': ed.meta.name = String(v); ed.scheduleAutosave(); break;
      case 'legend': ed.updateLegend({ [k]: v }); syncToolbar(ed); break;
    }
    if (scope !== 'node' || k === 'type') this.refresh(true);
  }

  private setTextIfChanged(cell: Cell | undefined, v: Value): void {
    if (cell && cell.getValue() !== v) this.ed.setText(cell, String(v));
  }

  private applyNode(cells: Cell[], k: string, v: Value): void {
    const ed = this.ed;
    switch (k) {
      case 'text': this.setTextIfChanged(cells[0], v); break;
      case 'type': ed.retype(cells, v as NodeType); break;
      case 'w': case 'h': {
        const g = cells[0].getGeometry();
        if (g) ed.setSize(cells[0], k === 'w' ? Number(v) : g.width, k === 'h' ? Number(v) : g.height);
        break;
      }
      case 'bold': case 'italic': {
        const bit = k === 'bold' ? 1 : 2;
        ed.patchStyle(cells, st => ({ ...st, fontStyle: v ? Number(st.fontStyle ?? 0) | bit : Number(st.fontStyle ?? 0) & ~bit }));
        break;
      }
      case 'inLegend': ed.setInLegend(cells, Boolean(v)); break;
      default: ed.setStyle(cells, k, v);
    }
  }

  private applyLane(cells: Cell[], k: string, v: Value): void {
    const ed = this.ed;
    switch (k) {
      case 'name': this.setTextIfChanged(cells[0], v); break;
      case 'dir': ed.setLaneDir(cells, v as LaneDir); break;
      case 'border': ed.patchStyle(cells, st => applyBorder({ ...st }, v as BorderType)); break;
      case 'band':
        ed.patchStyle(cells, st => ({ ...st, startSize: v ? BAND_SIZE : 0 }));
        ed.fitAllLanes();
        break;
      default:
        ed.setStyle(cells, k, v);
        if (k === 'startSize') ed.fitAllLanes();
    }
  }

  private applyEdge(cells: Cell[], k: string, v: Value): void {
    const ed = this.ed;
    switch (k) {
      case 'label': this.setTextIfChanged(cells[0], v); break;
      case 'dash': ed.patchStyle(cells, st => setDash({ ...st }, v as LineDash)); break;
      case 'routing': ed.patchStyle(cells, st => setRouting({ ...st }, v as Routing)); break;
      case 'arrow': ed.patchStyle(cells, st => setArrows({ ...st }, v as ArrowMode)); break;
      default: ed.setStyle(cells, k, v);
    }
  }

  /* ---------------- Pulsanti del pannello ---------------- */
  action(name: string, el: HTMLElement): boolean {
    const ed = this.ed, s = this.targets, g = ed.graph, model = g.getDataModel();
    switch (name) {
      case 'nodePreset':
        ed.patchStyle(s.nodes, st => ({ ...st, fillColor: el.dataset.fill ?? '', strokeColor: el.dataset.stroke ?? '' }));
        break;
      case 'lanePreset': {
        const p = LANE_PRESETS[Number(el.dataset.i)];
        ed.patchStyle(s.lanes, st => ({ ...st, fillColor: p.header, swimlaneFillColor: p.body, strokeColor: p.border }));
        break;
      }
      case 'edgeColor': {
        const c = el.dataset.c ?? '#5b6573';
        ed.patchStyle(s.edges, st => ({ ...st, strokeColor: c, fontColor: c }));
        break;
      }
      case 'invertEdge':
        g.batchUpdate(() => {
          ed.patchStyle(s.edges, swapEnds);
          ed.invertEdges(s.edges);
        });
        break;
      case 'resetLabel':
        g.batchUpdate(() => {
          for (const e of s.edges) {
            const geo = e.getGeometry()?.clone();
            if (geo) { geo.offset = null; model.setGeometry(e, geo); }
          }
        });
        break;
      case 'align': ed.align(el.dataset.a as AlignKind); return true;
      default: return false;
    }
    this.refresh(true);
    return true;
  }
}

export function syncToolbar(ed: FlowEditor): void {
  $<HTMLInputElement>('#tb-bg').value = ed.meta.settings.background;
  $<HTMLInputElement>('#tb-grid').checked = ed.meta.settings.grid;
  $<HTMLInputElement>('#tb-legend').checked = ed.meta.legend.visible;
}
