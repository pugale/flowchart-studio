// =====================================================================
//  FlowEditor: configura maxGraph e gestisce documento, cronologia,
//  azioni, vista (zoom, adatta, scorrimento) e salvataggio.
//  Corsie e legenda sono in moduli separati.
// =====================================================================
import {
  Cell, Clipboard, ConnectionConstraint, Geometry, Graph, ImageBox, InternalEvent, Point,
  Rectangle, RubberBandHandler, UndoManager, getDefaultPlugins,
  type CellState, type ConnectionHandler, type EventObject, type EventSource, type InternalMouseEvent, type PanningHandler
} from '@maxgraph/core';
import { parseDocJson } from '../core/docIO';
import {
  ANCHOR_POINT, FREE_ARROW_LENGTH, LANE_SIZE, NODE_DEFS, applyTextCase, edgeStyle, freeArrowStyle, isDark,
  laneDirOf, laneStyle, nodeStyle, retypeStyle, setLaneDir, textCaseOf, toHex, type LaneDir
} from '../core/styles';
import type { DocEdge, DocLegend, DocNode, DocSettings, FlowDoc, NodeType, Pt, StyleMap, StyleValue } from '../core/types';
import { emptyDoc } from '../core/types';
import { backgroundFirst } from '../core/zorder';
import { asStyle, childrenOf, descendantsOf, fc, isFreeEdge, rectOf, setGeo, styleOf, type FcCell } from './cells';
import { LaneManager } from './lanes';
import { LegendController } from './legend';
import { registerShapes } from './shapes';
import { wrapText } from './text';

const AUTOSAVE_KEY = 'flowchart-studio:autosave';
const AUTOSAVE_DELAY = 600;
const MAX_FIT_ZOOM = 1.5;      // "Adatta" non ingrandisce oltre il 150%
const MIN_ZOOM = 0.05;
const FIT_MARGIN = 40;         // margine attorno al diagramma dopo "Adatta" (px schermo)
const SCROLL_PAD = 30;         // spazio libero oltre i bordi del diagramma, raggiungibile con le barre
const POINT_IMG = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><circle cx="6" cy="6" r="4.5" fill="#ffffff" stroke="#2f80ed" stroke-width="1.5"/></svg>'
);
const CONSTRAINTS = Object.values(ANCHOR_POINT).map(([x, y]) => new ConnectionConstraint(new Point(x, y), true));

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
/** Elementi che si possono trascinare dalla palette */
export type DropKind = NodeType | 'lane' | 'laneV' | 'arrow';

export class FlowEditor {
  readonly graph: Graph;
  readonly undoManager = new UndoManager();
  readonly lanesMgr: LaneManager;
  readonly legend: LegendController;
  /** Metadati del documento non contenuti nel modello maxGraph */
  meta: { name: string; settings: DocSettings; legend: DocLegend };

  onSelectionChange: () => void = () => {};
  onModelChange: () => void = () => {};
  onHistoryChange: () => void = () => {};
  onZoom: (scale: number) => void = () => {};
  spaceDown = false;

  private suppressUndo = false;
  private silentDepth = 0;
  private autosaveTimer = 0;
  private scrollFrame = 0;
  private panning = false;

  constructor(private readonly container: HTMLElement) {
    registerShapes();
    const d = emptyDoc();
    this.meta = { name: d.name, settings: d.settings, legend: d.legend };
    this.graph = new Graph(container, undefined, [...getDefaultPlugins(), RubberBandHandler]);
    this.lanesMgr = new LaneManager(this);
    this.legend = new LegendController(this);
    this.configureGraph();
    this.installListeners();
  }

  /* =================== Configurazione =================== */
  private configureGraph(): void {
    const g = this.graph;
    g.setHtmlLabels(false);          // testo SVG puro: esportazione JPG/PDF fedele
    g.setConnectable(true);
    g.setPanning(true);
    g.setDropEnabled(true);          // trascinando una forma su una corsia ci entra dentro
    // Estremi liberi ammessi (frecce libere). I collegamenti tra forme restano agganciati:
    // non si possono staccare e, rilasciati nel vuoto, creano una nuova forma (createTarget).
    g.setAllowDanglingEdges(true);
    g.setCellsDisconnectable(false);
    g.setMultigraph(true);
    g.setConstrainChildren(false);   // le forme possono uscire: poi allarghiamo la corsia
    g.setExtendParents(false);
    g.setExtendParentsOnAdd(false);
    const ext = g as unknown as {
      setSwimlaneSelectionEnabled?: (v: boolean) => void; swimlaneSelectionEnabled?: boolean;
      setDisconnectOnMove?: (v: boolean) => void; disconnectOnMove?: boolean;
      setResizeContainer?: (v: boolean) => void; border?: number;
    };
    if (ext.setSwimlaneSelectionEnabled) ext.setSwimlaneSelectionEnabled(false); else ext.swimlaneSelectionEnabled = false;
    // spostando un collegamento non lo si stacca dalle forme
    if (ext.setDisconnectOnMove) ext.setDisconnectOnMove(false); else ext.disconnectOnMove = false;
    // il contenitore resta fisso: se il diagramma è più grande compaiono le barre di scorrimento
    ext.setResizeContainer?.(false);
    ext.border = SCROLL_PAD;
    // trascinando la vista si muovono le barre di scorrimento, non il disegno
    (g as unknown as { useScrollbarsForPanning?: boolean }).useScrollbarsForPanning = true;

    Object.assign(g.getStylesheet().getDefaultVertexStyle(), { fontFamily: 'Arial', fontColor: '#333333', fontSize: 12 });

    // 4 punti di ancoraggio per ogni forma (stesso array riusato)
    g.getAllConnectionConstraints = (terminal: CellState | null) =>
      terminal?.cell && this.isNode(terminal.cell) ? CONSTRAINTS : null;
    // Solo le forme si collegano: corsie e legenda nascono con setConnectable(false)
    // (in maxGraph non esiste graph.isCellConnectable, il controllo è sulla cella)

    // Una freccia libera resta libera: i suoi estremi non si agganciano alle forme
    const baseValidation = g.getEdgeValidationError.bind(g);
    g.getEdgeValidationError = (edge: Cell | null, source: Cell | null, target: Cell | null) =>
      isFreeEdge(edge) && (source || target) ? '' : baseValidation(edge, source, target);

    // Testo che va a capo da solo in base alla larghezza, con maiuscole/minuscole (con cache)
    const baseGetLabel = g.getLabel.bind(g);
    g.getLabel = (cell?: Cell | null) => {
      const v = baseGetLabel(cell);
      if (!cell || typeof v !== 'string' || !v || !this.isNode(cell)) return v;
      const geo = cell.getGeometry();
      if (!geo) return v;
      const st = g.getCellStyle(cell) as unknown as StyleMap;
      const ratio = NODE_DEFS[this.typeOf(cell)]?.textRatio ?? 1;
      const pad = 2 * Number(st.spacing ?? 4) + Number(st.spacingLeft ?? 0) + Number(st.spacingRight ?? 0);
      const fs = Number(st.fontStyle ?? 0);
      const shown = applyTextCase(v, textCaseOf(styleOf(cell)));
      return wrapText(shown, Number(st.fontSize ?? 12), String(st.fontFamily ?? 'Arial'), (fs & 1) === 1, (fs & 2) === 2,
        Math.max(10, geo.width * ratio - pad));
    };

    // Collegamento rilasciato nel vuoto = nuova forma collegata, subito in modifica
    const ch = g.getPlugin<ConnectionHandler>('ConnectionHandler');
    if (ch) {
      ch.createTarget = true;
      try { ch.constraintHandler.pointImage = new ImageBox(POINT_IMG, 12, 12); } catch { /* API diversa: resta l'icona standard */ }
      ch.addListener(InternalEvent.CONNECT, (_s: EventSource, evt: EventObject) => {
        if (!evt.getProperty('terminalInserted')) return;
        const target = (evt.getProperty('cell') as Cell | null)?.getTerminal(false);
        if (!target) return;
        g.getDataModel().setValue(target, '');
        queueMicrotask(() => { g.setSelectionCell(target); g.startEditingAtCell(target); });
      });
    }

    // Spostamento della vista ("mano"):
    //  - tasto sinistro premuto in un punto vuoto e trascina
    //  - Spazio + trascina, oppure tasto centrale, ovunque
    //  - Maiusc + trascina nel vuoto = selezione a riquadro (non sposta la vista)
    const ph = g.getPlugin<PanningHandler>('PanningHandler');
    if (ph) {
      ph.useLeftButtonForPanning = true;     // valido solo nei punti vuoti (nessuna cella sotto il mouse)
      const baseTrigger = ph.isPanningTrigger.bind(ph);
      ph.isPanningTrigger = (me: InternalMouseEvent) => {
        const ev = me.getEvent() as MouseEvent;
        if (this.spaceDown || ev.button === 1) return true;
        if (ev.shiftKey) return false;       // lascia spazio alla selezione a riquadro
        return baseTrigger(me);
      };
      const baseForce = ph.isForcePanningEvent.bind(ph);
      ph.isForcePanningEvent = (me: InternalMouseEvent) => this.spaceDown || (me.getEvent() as MouseEvent).button === 1 || baseForce(me);
      // cursore a mano chiusa durante lo spostamento
      ph.addListener(InternalEvent.PAN_START, () => { this.panning = true; this.container.classList.add('is-panning'); });
      ph.addListener(InternalEvent.PAN_END, () => {
        this.panning = false;
        this.container.classList.remove('is-panning');
        this.scheduleScrollFix();
      });
    }
    // sicurezza: se il rilascio avviene fuori dalla finestra la mano non resta "appesa"
    window.addEventListener('pointerup', () => {
      if (!this.panning) this.container.classList.remove('is-panning');
    });

    // Ctrl + rotella = zoom
    InternalEvent.addMouseWheelListener((evt: Event, up: boolean) => {
      if (!(evt as WheelEvent).ctrlKey) return;
      if (up) g.zoomIn(); else g.zoomOut();
      InternalEvent.consume(evt);
    }, this.container);
  }

  private installListeners(): void {
    const g = this.graph;
    const model = g.getDataModel();
    const onUndo = (_s: EventSource, evt: EventObject) => {
      if (!this.suppressUndo) this.undoManager.undoableEditHappened(evt.getProperty('edit'));
      this.onHistoryChange();
    };
    model.addListener(InternalEvent.UNDO, onUndo);
    g.getView().addListener(InternalEvent.UNDO, onUndo);

    model.addListener(InternalEvent.CHANGE, () => {
      this.scheduleScrollFix();
      if (this.silentDepth) return;
      this.keepLanesBehind();
      this.legend.schedule();
      this.scheduleAutosave();
      this.onModelChange();
    });
    g.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.onSelectionChange());

    const grow = (reason: 'move' | 'resize' | 'add') => (_s: EventSource, evt: EventObject) =>
      this.lanesMgr.normalize(evt.getProperty('cells') as Cell[], reason);
    g.addListener(InternalEvent.CELLS_MOVED, grow('move'));
    g.addListener(InternalEvent.CELLS_RESIZED, grow('resize'));
    g.addListener(InternalEvent.CELLS_ADDED, grow('add'));

    // Doppio clic nel vuoto (anche dentro una corsia) = nuovo testo libero
    g.addListener(InternalEvent.DOUBLE_CLICK, (_s: EventSource, evt: EventObject) => {
      const cell = evt.getProperty('cell') as Cell | null;
      const me = evt.getProperty('event') as MouseEvent | null;
      if (!me || (cell && !this.isLane(cell))) return;
      const hits = (g as unknown as { hitsSwimlaneContent?: (c: Cell, x: number, y: number) => boolean }).hitsSwimlaneContent;
      if (cell && hits && !hits.call(g, cell, me.offsetX, me.offsetY)) return; // doppio clic sulla banda = rinomina
      const pt = g.getPointForEvent(me);
      const [created] = this.dropShape('text', pt.x, pt.y, cell);
      if (created) g.startEditingAtCell(created);
      evt.consume();
    });

    const view = g.getView();
    const zoomed = () => { this.updateGridCss(); this.onZoom(view.scale); this.scheduleScrollFix(); };
    view.addListener(InternalEvent.SCALE, zoomed);
    view.addListener(InternalEvent.SCALE_AND_TRANSLATE, zoomed);
    view.addListener(InternalEvent.TRANSLATE, () => this.scheduleScrollFix());
  }

  /* =================== Vista: adatta e barre di scorrimento =================== */
  /**
   * Barre di scorrimento: il browser le mostra solo per il contenuto a destra e in basso.
   * Se il diagramma (o una parte) finisce a sinistra/sopra l'origine, si sposta la vista
   * di quanto serve e si corregge lo scorrimento della stessa quantità: a schermo non cambia
   * nulla, ma tutto il diagramma diventa raggiungibile con le barre.
   * Allo stesso modo si elimina lo spazio vuoto inutile a sinistra/sopra.
   */
  private scheduleScrollFix(): void {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => { this.scrollFrame = 0; this.normalizeScroll(); });
  }

  private normalizeScroll(): void {
    if (this.panning) return;                    // durante lo spostamento non si tocca nulla
    const g = this.graph, v = g.getView(), c = this.container;
    const b = g.getGraphBounds();
    if (!b || (b.width === 0 && b.height === 0)) return;
    const delta = (start: number, scroll: number) =>
      start < SCROLL_PAD ? SCROLL_PAD - start : -Math.min(start - SCROLL_PAD, scroll);
    const dx = Math.round(delta(b.x, c.scrollLeft));
    const dy = Math.round(delta(b.y, c.scrollTop));
    if (!dx && !dy) return;
    const left = c.scrollLeft, top = c.scrollTop;
    v.setTranslate(v.translate.x + dx / v.scale, v.translate.y + dy / v.scale);
    c.scrollLeft = left + dx;
    c.scrollTop = top + dy;
  }

  /** Adatta: tutto il diagramma visibile e centrato nella dashboard */
  fit(): void {
    const g = this.graph, v = g.getView(), c = this.container;
    const b = g.getGraphBounds();
    if (!b || (b.width === 0 && b.height === 0)) {
      v.scaleAndTranslate(1, SCROLL_PAD, SCROLL_PAD);
      return;
    }
    const s0 = v.scale;
    // riquadro del diagramma in coordinate del modello (indipendenti da zoom e spostamento)
    const x0 = b.x / s0 - v.translate.x, y0 = b.y / s0 - v.translate.y;
    const w0 = Math.max(1, b.width / s0), h0 = Math.max(1, b.height / s0);
    const availW = c.clientWidth - 2 * FIT_MARGIN, availH = c.clientHeight - 2 * FIT_MARGIN;
    if (availW <= 0 || availH <= 0) return;      // dashboard non visibile
    const s = Math.max(MIN_ZOOM, Math.min(MAX_FIT_ZOOM, availW / w0, availH / h0));
    const tx = (FIT_MARGIN + (availW - w0 * s) / 2) / s - x0;
    const ty = (FIT_MARGIN + (availH - h0 * s) / 2) / s - y0;
    v.scaleAndTranslate(s, tx, ty);
    c.scrollLeft = 0;
    c.scrollTop = 0;
  }

  /* =================== Classificazione celle =================== */
  isLane(c: Cell | null | undefined): boolean { return !!c && (!!fc(c).fcLane || this.graph.isSwimlane(c)); }
  isLegend(c: Cell | null | undefined): boolean { return !!c && !!fc(c).fcLegend; }
  isNode(c: Cell | null | undefined): c is Cell { return !!c && c.isVertex() && !this.isLane(c) && !this.isLegend(c); }
  typeOf(c: Cell): NodeType { return fc(c).fcType ?? 'process'; }
  isInLegend(c: Cell): boolean { return !fc(c).fcNoLegend; }

  private root(): Cell { return this.graph.getDefaultParent(); }
  allCells(): Cell[] { return descendantsOf(this.root()); }
  lanes(): Cell[] { return childrenOf(this.root()).filter(c => this.isLane(c)); }

  /**
   * Le corsie restano sempre in secondo piano rispetto a forme, collegamenti,
   * frecce libere e legenda. Si corregge dopo ogni modifica (aggiunta, incolla,
   * "porta in primo piano", annulla...) senza creare passi in annulla/ripeti.
   */
  keepLanesBehind(): void {
    const root = this.root();
    const order = backgroundFirst(childrenOf(root), c => this.isLane(c));
    if (!order) return;
    const model = this.graph.getDataModel();
    this.silent(() => order.forEach((c, i) => { if (this.isLane(c)) model.add(root, c, i); }));
  }

  private laneAt(x: number, y: number): Cell | null {
    let best: Cell | null = null, bestArea = Infinity;
    for (const l of this.lanes()) {
      const r = rectOf(l);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.w * r.h < bestArea) { best = l; bestArea = r.w * r.h; }
    }
    return best;
  }

  /** Origine assoluta di una cella (somma delle posizioni dei contenitori) */
  private originOf(c: Cell | null): Pt {
    let x = 0, y = 0;
    for (let p = c; p && p !== this.root(); p = p.getParent()) {
      const geo = p.getGeometry();
      if (geo && p.isVertex()) { x += geo.x; y += geo.y; }
    }
    return { x, y };
  }

  /* =================== Creazione celle =================== */
  createNodeCell(type: NodeType, text?: string): Cell {
    const d = NODE_DEFS[type];
    const cell = new Cell(text ?? d.text, new Geometry(0, 0, d.w, d.h), asStyle(nodeStyle(type))) as FcCell;
    cell.setVertex(true);
    cell.fcType = type;
    cell.fcNoLegend = d.inLegend === false;
    return cell;
  }

  createLaneCell(name = 'Corsia', dir: LaneDir = 'h'): Cell {
    const { w, h } = LANE_SIZE[dir];
    const cell = new Cell(name, new Geometry(0, 0, w, h), asStyle(laneStyle({ dir }))) as FcCell;
    cell.setVertex(true);
    cell.setConnectable(false);
    cell.fcLane = true;
    return cell;
  }

  /** Freccia libera orizzontale centrata in (cx, cy), coordinate assolute */
  createFreeArrow(cx: number, cy: number): Cell {
    const g = this.graph;
    const geo = new Geometry();
    geo.relative = true;
    geo.setTerminalPoint(new Point(g.snap(cx - FREE_ARROW_LENGTH / 2), g.snap(cy)), true);
    geo.setTerminalPoint(new Point(g.snap(cx + FREE_ARROW_LENGTH / 2), g.snap(cy)), false);
    const cell = new Cell('', geo, asStyle(freeArrowStyle(this.meta.settings.background)));
    cell.setEdge(true);
    return cell;
  }

  /** Inserisce una forma, una corsia o una freccia libera centrata nel punto indicato */
  dropShape(kind: DropKind, x: number, y: number, target: Cell | null): Cell[] {
    const g = this.graph;
    if (kind === 'arrow') {
      // la freccia libera sta al livello principale: non segue gli spostamenti delle corsie
      const cell = g.addCell(this.createFreeArrow(x, y), this.root());
      g.setSelectionCell(cell);
      return [cell];
    }
    const isLaneKind = kind === 'lane' || kind === 'laneV';
    const cell = isLaneKind ? this.createLaneCell('Corsia', kind === 'laneV' ? 'v' : 'h') : this.createNodeCell(kind);
    const geo = cell.getGeometry()!;
    const parent = isLaneKind ? undefined : (this.isLane(target) ? target! : this.laneAt(x, y) ?? undefined);
    // importCells usa coordinate assolute e le converte rispetto alla corsia di destinazione
    const res = g.importCells([cell], g.snap(x - geo.width / 2), g.snap(y - geo.height / 2), parent);
    g.setSelectionCells(res);
    return res;
  }

  viewCenter(): Pt {
    const v = this.graph.getView(), c = this.container;
    return {
      x: (c.scrollLeft + c.clientWidth / 2) / v.scale - v.translate.x,
      y: (c.scrollTop + c.clientHeight / 2) / v.scale - v.translate.y
    };
  }

  /* =================== Documento: carica / salva =================== */
  /** Esegue modifiche al modello fuori da annulla/ripeti e senza notifiche */
  silent(fn: () => void): void {
    this.silentDepth++;
    this.suppressUndo = true;
    try { this.graph.batchUpdate(fn); } finally { this.suppressUndo = false; this.silentDepth--; }
  }

  loadDoc(doc: FlowDoc): void {
    const g = this.graph;
    g.stopEditing(true);
    this.meta = { name: doc.name, settings: { ...doc.settings }, legend: { ...doc.legend, descriptions: { ...doc.legend.descriptions } } };
    this.silent(() => {
      g.getDataModel().clear();
      this.insertDocCells(doc, this.root(), 0, 0);
      this.legend.create(this.root(), doc.legend);
    });
    this.keepLanesBehind();
    this.applySettings();
    this.undoManager.clear();
    this.lanesMgr.remember();
    this.legend.refresh(true);
    this.onHistoryChange();
    this.onSelectionChange();
    this.scheduleAutosave();
  }

  /** Aggiunge un documento sotto il contenuto esistente (annullabile) */
  appendDoc(doc: FlowDoc): void {
    const g = this.graph;
    const b = this.contentBounds();
    const dx = b ? Math.round(b.x) : 0, dy = b ? Math.round(b.y + b.h + 80) : 0;
    for (const [k, v] of Object.entries(doc.legend.descriptions)) this.meta.legend.descriptions[k] ??= v;
    g.batchUpdate(() => {
      const cells = this.insertDocCells(doc, this.root(), dx, dy);
      const legend = this.legend.current;
      if (legend) g.orderCells(false, [legend]);
      g.setSelectionCells(cells);
    });
    this.lanesMgr.remember();
    this.legend.refresh(true);
  }

  private insertDocCells(doc: FlowDoc, parent: Cell, dx: number, dy: number): Cell[] {
    const g = this.graph;
    const laneMap = new Map<string, Cell>();
    const nodeMap = new Map<string, Cell>();
    const created: Cell[] = [];
    const shift = (p: Pt) => new Point(p.x + dx, p.y + dy);
    for (const l of doc.lanes) {
      const cell = g.insertVertex({ parent, id: l.id, value: l.name, position: [l.x + dx, l.y + dy], size: [l.w, l.h], style: asStyle(l.style) }) as FcCell;
      cell.fcLane = true;
      cell.setConnectable(false);
      laneMap.set(l.id, cell);
      created.push(cell);
    }
    for (const n of doc.nodes) {
      const lane = n.parent ? laneMap.get(n.parent) : undefined;
      const cell = g.insertVertex({
        parent: lane ?? parent, id: n.id, value: n.text,
        position: [n.x + (lane ? 0 : dx), n.y + (lane ? 0 : dy)], size: [n.w, n.h], style: asStyle(n.style)
      }) as FcCell;
      cell.fcType = n.type;
      cell.fcNoLegend = !n.inLegend;
      nodeMap.set(n.id, cell);
      if (!lane) created.push(cell);
    }
    for (const e of doc.edges) {
      const s = e.source ? nodeMap.get(e.source) ?? null : null;
      const t = e.target ? nodeMap.get(e.target) ?? null : null;
      if ((e.source && !s) || (e.target && !t)) continue;
      const cell = g.insertEdge({ parent, id: e.id, value: e.label, source: s, target: t, style: asStyle(e.style) });
      const geo = cell.getGeometry();
      if (geo) {
        if (!s && e.sourcePoint) geo.setTerminalPoint(shift(e.sourcePoint), true);
        if (!t && e.targetPoint) geo.setTerminalPoint(shift(e.targetPoint), false);
        if (e.points?.length) geo.points = e.points.map(shift);
        if (e.labelOffset) geo.offset = new Point(e.labelOffset.x, e.labelOffset.y);
      }
      created.push(cell);
    }
    return created;
  }

  toDoc(): FlowDoc {
    const doc = emptyDoc();
    doc.name = this.meta.name;
    doc.settings = { ...this.meta.settings };
    doc.legend = { ...this.meta.legend, descriptions: { ...this.meta.legend.descriptions } };
    const lp = this.legend.position();
    if (lp) Object.assign(doc.legend, lp);

    const nodeOf = (c: Cell, parent: string | null): DocNode => ({
      id: c.getId() ?? '', parent, type: this.typeOf(c), ...rectOf(c),
      text: String(c.getValue() ?? ''), inLegend: this.isInLegend(c), style: styleOf(c)
    });
    for (const c of childrenOf(this.root())) {
      if (this.isLane(c)) {
        const id = c.getId() ?? '';
        doc.lanes.push({ id, name: String(c.getValue() ?? ''), ...rectOf(c), style: styleOf(c) });
        for (const k of childrenOf(c)) if (this.isNode(k)) doc.nodes.push(nodeOf(k, id));
      } else if (this.isNode(c)) doc.nodes.push(nodeOf(c, null));
    }
    for (const c of this.allCells()) {
      if (!c.isEdge()) continue;
      const geo = c.getGeometry();
      const o = this.originOf(c.getParent());
      const abs = (p: { x: number; y: number } | null | undefined): Pt | undefined => (p ? { x: p.x + o.x, y: p.y + o.y } : undefined);
      const s = c.getTerminal(true), t = c.getTerminal(false);
      const sp = s ? undefined : abs(geo?.getTerminalPoint(true));
      const tp = t ? undefined : abs(geo?.getTerminalPoint(false));
      if ((!s && !sp) || (!t && !tp)) continue;
      const e: DocEdge = {
        id: c.getId() ?? '', source: s?.getId() ?? null, target: t?.getId() ?? null,
        label: String(c.getValue() ?? ''), style: styleOf(c)
      };
      if (sp) e.sourcePoint = sp;
      if (tp) e.targetPoint = tp;
      if (geo?.points?.length) e.points = geo.points.map(p => abs(p)!);
      if (geo?.offset && (geo.offset.x || geo.offset.y)) e.labelOffset = { x: geo.offset.x, y: geo.offset.y };
      doc.edges.push(e);
    }
    return doc;
  }

  loadAutosave(): boolean {
    try {
      const s = localStorage.getItem(AUTOSAVE_KEY);
      if (!s) return false;
      this.loadDoc(parseDocJson(s));
      return true;
    } catch { return false; }
  }

  /** Salvataggio automatico: raggruppato ed eseguito quando il browser è libero */
  scheduleAutosave(): void {
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      const save = () => { try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this.toDoc())); } catch { /* spazio esaurito */ } };
      if ('requestIdleCallback' in window) requestIdleCallback(save, { timeout: 2000 }); else save();
    }, AUTOSAVE_DELAY);
  }

  /* =================== Impostazioni =================== */
  applySettings(): void {
    const s = this.meta.settings, g = this.graph;
    g.setGridSize(s.gridSize);
    g.setGridEnabled(s.snap);
    this.container.style.backgroundColor = s.background;
    Object.assign(g.getStylesheet().getDefaultEdgeStyle(), edgeStyle({}, s.background));
    // le etichette delle frecce hanno lo sfondo del foglio
    const edges = this.allCells().filter(c => c.isEdge() && styleOf(c).labelBackgroundColor !== s.background);
    if (edges.length) this.silent(() => g.setCellStyles('labelBackgroundColor', s.background, edges));
    this.updateGridCss();
    g.refresh();
    this.scheduleAutosave();
  }

  private updateGridCss(): void {
    const s = this.meta.settings;
    const size = s.gridSize * 2 * this.graph.getView().scale;
    const st = this.container.style;
    if (s.grid && size >= 6) {
      const dot = isDark(toHex(s.background)) ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
      st.backgroundImage = `radial-gradient(circle, ${dot} 1px, transparent 1.3px)`;
      st.backgroundSize = `${size}px ${size}px`;
    } else st.backgroundImage = 'none';
  }

  /** Il contenitore ha cambiato dimensione (es. pannelli nascosti): ricalcola la vista */
  resized(): void {
    (this.graph as unknown as { sizeDidChange?: () => void }).sizeDidChange?.();
    this.scheduleScrollFix();
  }

  /* =================== Modifiche dal pannello proprietà =================== */
  setStyle(cells: Cell[], key: string, value: StyleValue): void {
    if (cells.length) this.graph.setCellStyles(key as never, value as never, cells);
  }
  /** Modifica più chiavi di stile in un'unica operazione annullabile */
  patchStyle(cells: Cell[], patch: (s: StyleMap) => StyleMap): void {
    if (!cells.length) return;
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => { for (const c of cells) model.setStyle(c, asStyle(patch(styleOf(c)))); });
  }
  setText(cell: Cell, text: string): void { this.graph.getDataModel().setValue(cell, text); }
  setSize(cell: Cell, w: number, h: number): void {
    const geo = cell.getGeometry();
    if (geo) this.graph.resizeCells([cell], [new Rectangle(geo.x, geo.y, Math.max(10, w), Math.max(10, h))], false);
  }
  retype(cells: Cell[], type: NodeType): void {
    this.graph.batchUpdate(() => {
      for (const c of cells) {
        fc(c).fcType = type;
        this.graph.getDataModel().setStyle(c, asStyle(retypeStyle(styleOf(c), type)));
      }
    });
  }
  setInLegend(cells: Cell[], v: boolean): void {
    for (const c of cells) fc(c).fcNoLegend = !v;
    this.legend.refresh(true);
    this.scheduleAutosave();
  }
  updateLegend(patch: Partial<DocLegend>): void {
    Object.assign(this.meta.legend, patch);
    this.legend.refresh(true);
    this.scheduleAutosave();
  }
  legendDescription(key: string, text: string): void { this.updateLegend({ descriptions: { ...this.meta.legend.descriptions, [key]: text } }); }

  /**
   * Cambia l'orientamento delle corsie (orizzontale ↔ verticale).
   * La corsia viene "ruotata": larghezza e altezza si scambiano e le forme interne
   * scambiano x e y, così la banda del nome passa da sinistra all'alto senza coprirle.
   */
  setLaneDir(lanes: Cell[], dir: LaneDir): void {
    const g = this.graph, model = g.getDataModel();
    const todo = lanes.filter(l => laneDirOf(styleOf(l)) !== dir);
    if (!todo.length) return;
    g.batchUpdate(() => {
      for (const lane of todo) {
        model.setStyle(lane, asStyle(setLaneDir(styleOf(lane), dir)));
        setGeo(g, lane, geo => { const w = geo.width; geo.width = geo.height; geo.height = w; });
        for (const k of childrenOf(lane)) {
          setGeo(g, k, geo => {
            if (k.isVertex()) { const x = geo.x; geo.x = geo.y; geo.y = x; }
            else if (geo.points?.length) geo.points = geo.points.map(p => new Point(p.y, p.x));
          });
        }
      }
      this.lanesMgr.normalize(todo, 'add', true);
    });
  }

  /** Inverte la direzione: scambia forme agganciate, punti liberi e punti intermedi */
  invertEdges(edges: Cell[]): void {
    const model = this.graph.getDataModel();
    this.graph.batchUpdate(() => {
      for (const e of edges) {
        const src = e.getTerminal(true), trg = e.getTerminal(false);
        model.setTerminal(e, trg, true);
        model.setTerminal(e, src, false);
        setGeo(this.graph, e, g => {
          const sp = g.getTerminalPoint(true), tp = g.getTerminalPoint(false);
          g.setTerminalPoint(tp, true);
          g.setTerminalPoint(sp, false);
          if (g.points?.length) g.points = [...g.points].reverse();
        });
      }
    });
  }

  /* =================== Azioni =================== */
  undo(): void { if (this.undoManager.canUndo()) this.undoManager.undo(); this.onHistoryChange(); }
  redo(): void { if (this.undoManager.canRedo()) this.undoManager.redo(); this.onHistoryChange(); }

  private selection(): Cell[] { return this.graph.getSelectionCells().filter(c => !this.isLegend(c)); }

  deleteSelection(): void {
    const cells = this.selection();
    if (cells.length) this.graph.removeCells(cells, true);
  }
  copy(): void {
    const cells = this.selection();
    if (cells.length) Clipboard.copy(this.graph, cells);
  }
  paste(): void { Clipboard.paste(this.graph); }
  duplicate(): void { this.copy(); this.paste(); }
  nudge(dx: number, dy: number): void {
    const cells = this.graph.getSelectionCells().filter(c => c.isVertex() || isFreeEdge(c));
    if (cells.length) this.graph.moveCells(cells, dx, dy);
  }
  selectAll(): void { this.graph.setSelectionCells(this.allCells().filter(c => !this.isLegend(c) && c.isVisible())); }
  /** Primo piano / in fondo. Le forme non possono finire sotto le corsie (vedi keepLanesBehind) */
  toFront(back = false): void {
    const cells = this.graph.getSelectionCells().filter(c => !this.isLegend(c));
    if (cells.length) this.graph.orderCells(back, cells);
  }

  groupSelection(): void {
    const g = this.graph;
    const cells = g.getSelectionCells().filter(c => this.isNode(c) && c.getParent() === this.root());
    if (!cells.length) return;
    g.batchUpdate(() => {
      const lane = g.groupCells(this.createLaneCell('Gruppo'), 30, cells);
      this.lanesMgr.normalize([lane], 'add', true);
      g.setSelectionCell(lane);
    });
  }
  ungroupSelection(): void {
    const lanes = this.graph.getSelectionCells().filter(c => this.isLane(c));
    if (lanes.length) this.graph.ungroupCells(lanes);
  }
  fitAllLanes(): void { this.lanesMgr.fitAll(); }

  align(kind: AlignKind): void {
    const cells = this.graph.getSelectionCells().filter(c => this.isNode(c));
    if (cells.length > 1) this.graph.alignCells(kind, cells);
  }
  distribute(horizontal: boolean): void {
    const cells = this.graph.getSelectionCells().filter(c => this.isNode(c));
    if (cells.length < 3) return;
    const items = cells.map(c => {
      const r = rectOf(c), o = this.originOf(c.getParent());
      return { c, a: horizontal ? r.x + o.x : r.y + o.y, size: horizontal ? r.w : r.h };
    }).sort((p, q) => p.a - q.a);
    const last = items[items.length - 1];
    const gap = (last.a + last.size - items[0].a - items.reduce((s, x) => s + x.size, 0)) / (items.length - 1);
    let pos = items[0].a;
    this.graph.batchUpdate(() => {
      for (const x of items) {
        const d = Math.round(pos - x.a);
        if (d) setGeo(this.graph, x.c, g => { if (horizontal) g.x += d; else g.y += d; });
        pos += x.size + gap;
      }
    });
  }

  zoomIn(): void { this.graph.zoomIn(); }
  zoomOut(): void { this.graph.zoomOut(); }
  zoomActual(): void { this.graph.zoomActual(); }

  /** Riquadro del contenuto in coordinate del diagramma (scala 1) */
  contentBounds(): { x: number; y: number; w: number; h: number } | null {
    const v = this.graph.getView();
    const b = this.graph.getGraphBounds();
    if (!b || (b.width === 0 && b.height === 0)) return null;
    return { x: b.x / v.scale - v.translate.x, y: b.y / v.scale - v.translate.y, w: b.width / v.scale, h: b.height / v.scale };
  }
}
