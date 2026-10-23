// =====================================================================
//  Avvio: collega editor, palette, pannelli, menu, barra strumenti e tastiera
// =====================================================================
import './styles.css';
import { emptyDoc } from './core/types';
import exampleText from './examples/canali-richiesta.txt?raw';
import { FlowEditor } from './editor/FlowEditor';
import { $, toast } from './ui/dom';
import { FileOps } from './ui/files';
import { ImportDialog } from './ui/importDialog';
import { buildPalette } from './ui/palette';
import { PropertiesPanel, syncToolbar } from './ui/properties';
import { SummaryDialog } from './ui/summaryDialog';

/* ---------- Splash ---------- */
const splash = document.getElementById('splash');
const splashVer = document.getElementById('splash-ver');
if (splashVer) splashVer.textContent = `Versione ${__APP_VERSION__}`;
function hideSplash(): void {
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 400);
}
// un errore durante l'avvio viene mostrato nella splash invece di lasciarla bloccata
window.addEventListener('error', e => {
  if (!splash?.isConnected) return;
  splash.classList.add('error');
  const msg = document.getElementById('splash-msg');
  if (msg) msg.textContent = `Errore all'avvio: ${e.message}`;
});

const container = $('#graph');
const ed = new FlowEditor(container);
const props = new PropertiesPanel(ed);
const afterLoad = () => { syncToolbar(ed); props.refresh(true); ed.fit(); };
const files = new FileOps(ed, afterLoad);
const importer = new ImportDialog(ed, afterLoad);
const summary = new SummaryDialog(ed);
buildPalette(ed);

/* ---------- Menu a tendina (File, Esporta) ---------- */
function closeMenus(): void {
  document.querySelectorAll<HTMLElement>('.menu-list').forEach(list => { list.hidden = true; });
  document.querySelectorAll<HTMLElement>('[data-menu]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
function toggleMenu(toggle: HTMLElement): void {
  const list = toggle.nextElementSibling as HTMLElement | null;
  if (!list) return;
  const open = list.hidden;
  closeMenus();
  list.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) list.querySelector<HTMLElement>('button')?.focus();
}
// un clic fuori dal menu lo chiude (anche sulla dashboard, dove maxGraph intercetta i clic)
document.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement).closest('.menu')) closeMenus(); }, true);

/* ---------- Pannelli laterali nascondibili ---------- */
const LAYOUT_KEY = 'flowchart-studio:layout';
const layout: { palette: boolean; props: boolean } = (() => {
  try { return { palette: true, props: true, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') }; }
  catch { return { palette: true, props: true }; }
})();
function applyLayout(): void {
  document.body.classList.toggle('no-palette', !layout.palette);
  document.body.classList.toggle('no-props', !layout.props);
  $('[data-action="togglePalette"]').setAttribute('aria-pressed', String(layout.palette));
  $('[data-action="toggleProps"]').setAttribute('aria-pressed', String(layout.props));
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* ignora */ }
  requestAnimationFrame(() => ed.resized());
}
/** Selezionando un elemento il pannello delle impostazioni si riapre, se era nascosto */
function showPropsFor(selection: unknown[]): void {
  if (layout.props || !selection.length) return;
  layout.props = true;
  applyLayout();
}

/* ---------- Manuale ---------- */
const helpModal = $('#help-modal');
const helpFrame = $<HTMLIFrameElement>('#help-frame');
const help = {
  get isOpen(): boolean { return !helpModal.hidden; },
  open(): void {
    ed.graph.stopEditing(false);
    // caricato solo alla prima apertura: non rallenta l'avvio
    if (!helpFrame.getAttribute('src')) helpFrame.src = './manuale.html';
    helpModal.hidden = false;
    helpFrame.focus();
  },
  close(): void { helpModal.hidden = true; },
  print(): void { helpFrame.contentWindow?.print(); }
};
helpModal.addEventListener('pointerdown', e => { if (e.target === helpModal) help.close(); });
// Esc e F1 funzionano anche quando il cursore è dentro il manuale
helpFrame.addEventListener('load', () => {
  helpFrame.contentDocument?.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'F1') { e.preventDefault(); help.close(); }
  });
});

/* ---------- Aggiornamenti dell'interfaccia ---------- */
const btn = (sel: string) => $<HTMLButtonElement>(sel);
const updateHistory = () => {
  btn('[data-action="undo"]').disabled = !ed.undoManager.canUndo();
  btn('[data-action="redo"]').disabled = !ed.undoManager.canRedo();
};
ed.onHistoryChange = updateHistory;
ed.onSelectionChange = () => {
  const sel = ed.graph.getSelectionCells();
  showPropsFor(sel);
  props.refresh(true);
  btn('#tb-group').disabled = !sel.some(c => ed.isNode(c));
  btn('#tb-delete').disabled = !sel.some(c => !ed.isLegend(c));
};
let frame = 0;
ed.onModelChange = () => {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; props.refresh(false); });
};
ed.onZoom = s => { $('#zoom-label').textContent = Math.round(s * 100) + '%'; };

/* ---------- Esportazione ---------- */
async function exportAs(kind: 'jpg' | 'pdf'): Promise<void> {
  try {
    const mod = await import('./editor/exporter');   // caricato solo al primo export
    if (kind === 'jpg') {
      toast((await mod.exportJpg(ed)) ? 'JPG esportato' : 'Il diagramma è vuoto');
      return;
    }
    toast('Creazione del PDF…');
    const res = await mod.exportPdf(ed);
    toast(res === 'vector' ? 'PDF esportato'
      : res === 'raster' ? 'PDF esportato come immagine ad alta risoluzione'
      : 'Il diagramma è vuoto');
  } catch (e) {
    console.error(e);
    alert(`Esportazione ${kind.toUpperCase()} non riuscita: ${(e as Error).message}`);
  }
}

/* ---------- Azioni ---------- */
const actions: Record<string, (el: HTMLElement) => unknown> = {
  new: () => {
    if (!confirm('Creare un nuovo diagramma vuoto? Le modifiche non salvate andranno perse.')) return;
    files.forget();
    ed.loadDoc(emptyDoc());
    afterLoad();
  },
  open: () => files.open(),
  save: () => files.save(false),
  saveAs: () => files.save(true),
  summary: () => summary.open(),
  closeSummary: () => summary.close(),
  copySummary: () => summary.copy(),
  openImport: () => importer.open(),
  closeImport: () => importer.close(),
  importReplace: () => importer.run('replace'),
  importAdd: () => importer.run('append'),
  importTemplate: () => importer.template(),
  importExample: () => importer.setText(exampleText),
  help: () => help.open(),
  closeHelp: () => help.close(),
  helpPrint: () => help.print(),
  togglePalette: () => { layout.palette = !layout.palette; applyLayout(); },
  toggleProps: () => { layout.props = !layout.props; applyLayout(); },
  undo: () => ed.undo(),
  redo: () => ed.redo(),
  group: () => ed.groupSelection(),
  ungroup: () => ed.ungroupSelection(),
  delete: () => ed.deleteSelection(),
  fitLanes: () => { ed.fitAllLanes(); toast('Corsie adattate al contenuto'); },
  jpg: () => exportAs('jpg'),
  pdf: () => exportAs('pdf'),
  zoomIn: () => ed.zoomIn(),
  zoomOut: () => ed.zoomOut(),
  zoomReset: () => ed.zoomActual(),
  fit: () => ed.fit(),
  front: () => ed.toFront(false),
  back: () => ed.toFront(true),
  distH: () => ed.distribute(true),
  distV: () => ed.distribute(false)
};

document.addEventListener('click', ev => {
  const target = ev.target as HTMLElement;
  const toggle = target.closest<HTMLElement>('[data-menu]');
  if (toggle) { ev.preventDefault(); toggleMenu(toggle); return; }
  const b = target.closest<HTMLElement>('[data-action]');
  if (!b || (b as HTMLButtonElement).disabled) return;
  closeMenus();
  const name = b.dataset.action ?? '';
  ev.preventDefault();
  if (!props.action(name, b)) void actions[name]?.(b);
});

/* ---------- Barra strumenti: sfondo, griglia, legenda ---------- */
const onToolbar = (sel: string, fn: (el: HTMLInputElement) => void) =>
  $<HTMLInputElement>(sel).addEventListener('change', e => { fn(e.target as HTMLInputElement); props.refresh(true); });
onToolbar('#tb-bg', el => { ed.meta.settings.background = el.value; ed.applySettings(); });
onToolbar('#tb-grid', el => { ed.meta.settings.grid = el.checked; ed.applySettings(); });
onToolbar('#tb-legend', el => ed.updateLegend({ visible: el.checked }));

/* ---------- Tastiera ---------- */
const ARROWS: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
const isTyping = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.matches('input,textarea,select') || a.isContentEditable);
};

document.addEventListener('keydown', ev => {
  if (summary.isOpen) { if (ev.key === 'Escape') summary.close(); return; }
  if (help.isOpen) {
    if (ev.key === 'Escape' || ev.key === 'F1') { ev.preventDefault(); help.close(); }
    return;
  }
  if (importer.isOpen) { if (ev.key === 'Escape') importer.close(); return; }
  if (ev.key === 'Escape' && document.querySelector('.menu-list:not([hidden])')) { closeMenus(); return; }
  const mod = ev.ctrlKey || ev.metaKey;
  const k = ev.key.toLowerCase();
  if (ev.key === 'F1') { ev.preventDefault(); help.open(); return; }
  if (mod && k === 's') { ev.preventDefault(); void files.save(ev.shiftKey); return; }
  if (mod && k === 'o') { ev.preventDefault(); void files.open(); return; }
  if (mod && k === 'i') { ev.preventDefault(); importer.open(); return; }
  if (isTyping() || ed.graph.isEditing()) return;

  if (ev.code === 'Space') { ed.spaceDown = true; container.classList.add('panning'); ev.preventDefault(); return; }
  if (mod) {
    const shortcuts: Record<string, () => void> = {
      z: () => (ev.shiftKey ? ed.redo() : ed.undo()),
      y: () => ed.redo(),
      c: () => ed.copy(),
      v: () => ed.paste(),
      d: () => ed.duplicate(),
      a: () => ed.selectAll(),
      g: () => (ev.shiftKey ? ed.ungroupSelection() : ed.groupSelection())
    };
    if (shortcuts[k]) { ev.preventDefault(); shortcuts[k](); }
    return;
  }
  if (k === 'delete' || k === 'backspace') { ev.preventDefault(); ed.deleteSelection(); }
  else if (k === 'escape') ed.graph.clearSelection();
  else if (k === 'f2') { const c = ed.graph.getSelectionCell(); if (c) ed.graph.startEditingAtCell(c); }
  else if (ARROWS[k]) {
    ev.preventDefault();
    const st = ev.shiftKey ? 10 : 1;
    ed.nudge(ARROWS[k][0] * st, ARROWS[k][1] * st);
  }
});
document.addEventListener('keyup', ev => {
  if (ev.code === 'Space') { ed.spaceDown = false; container.classList.remove('panning'); }
});
// dopo un ridimensionamento della finestra le barre di scorrimento si ricalcolano
window.addEventListener('resize', () => ed.resized());

/* ---------- Avvio ---------- */
applyLayout();
if (!ed.loadAutosave()) ed.loadDoc(emptyDoc());
afterLoad();
updateHistory();
hideSplash();
