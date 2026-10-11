// =====================================================================
//  Finestra "Crea diagramma da testo"
//  Il controllo del testo parte 250 ms dopo l'ultima battuta.
// =====================================================================
import { TEMPLATE_TEXT, buildFlowDoc, parseFlowText } from '../core/textImport';
import type { FlowEditor } from '../editor/FlowEditor';
import { $, esc, toast } from './dom';

const DRAFT_KEY = 'flowchart-studio:import-draft';
const CHECK_DELAY = 250;

export class ImportDialog {
  private readonly modal = $('#import-modal');
  private readonly text = $<HTMLTextAreaElement>('#import-text');
  private readonly status = $('#import-status');
  private timer = 0;

  constructor(private readonly ed: FlowEditor, private readonly afterLoad: () => void) {
    this.text.addEventListener('input', () => this.scheduleCheck());
    this.text.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.run('replace'); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        this.text.setRangeText('    ', this.text.selectionStart, this.text.selectionEnd, 'end');
        this.scheduleCheck();
      }
    });
    this.modal.addEventListener('pointerdown', e => { if (e.target === this.modal) this.close(); });
  }

  get isOpen(): boolean { return !this.modal.hidden; }

  open(): void {
    this.ed.graph.stopEditing(false);
    if (!this.text.value) this.text.value = localStorage.getItem(DRAFT_KEY) ?? TEMPLATE_TEXT;
    this.modal.hidden = false;
    this.check();
    this.text.focus();
  }
  close(): void { this.modal.hidden = true; }

  setText(t: string): void { this.text.value = t; this.check(); this.text.focus(); }
  template(): void { this.setText(TEMPLATE_TEXT); }

  private scheduleCheck(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.check(), CHECK_DELAY);
  }

  private check(): void {
    clearTimeout(this.timer);
    try { localStorage.setItem(DRAFT_KEY, this.text.value); } catch { /* ignora */ }
    const p = parseFlowText(this.text.value);
    const warn = [...p.errors, ...(p.nodes.length ? buildFlowDoc(p).errors : [])];
    this.status.innerHTML = `<div class="ok">✔ ${p.nodes.length} passi · ${p.edges.length} collegamenti · ${p.lanes.length} corsie</div>` +
      warn.map(w => `<div class="warn">⚠ ${esc(w)}</div>`).join('');
  }

  run(mode: 'replace' | 'append'): void {
    const p = parseFlowText(this.text.value);
    if (!p.nodes.length) { toast('Scrivi almeno un passo'); return; }
    const { doc } = buildFlowDoc(p, mode === 'append' ? `t${Date.now().toString(36)}_` : '');
    if (mode === 'replace') {
      const hasContent = this.ed.allCells().some(c => this.ed.isNode(c));
      if (hasContent && !confirm('Il diagramma attuale verrà sostituito. Continuare? (salvalo prima, se serve)')) return;
      doc.settings = { ...this.ed.meta.settings };
      this.ed.loadDoc(doc);
    } else {
      this.ed.appendDoc(doc);
    }
    this.close();
    this.afterLoad();
    toast(`Diagramma creato: ${doc.nodes.length} forme, ${doc.edges.length} collegamenti`);
  }
}
