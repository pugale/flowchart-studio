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
  private readonly addButton = $<HTMLButtonElement>('#import-add');
  private readonly replaceButton = $<HTMLButtonElement>('#import-replace');
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
    this.status.addEventListener('click', e => {
      if (!(e.target instanceof Element)) return;
      const button = e.target.closest<HTMLButtonElement>('button[data-line]');
      if (!button) return;
      const line = Number(button.dataset.line);
      const starts = this.text.value.split(/\r?\n/);
      if (!Number.isInteger(line) || line < 1 || line > starts.length) return;
      let start = 0;
      for (let i = 1; i < line; i++) {
        const newline = this.text.value.indexOf('\n', start);
        if (newline < 0) return;
        start = newline + 1;
      }
      this.text.focus();
      this.text.setSelectionRange(start, start + (starts[line - 1]?.length ?? 0));
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
    const errors = [...p.errors, ...(p.nodes.length ? buildFlowDoc(p).errors : [])];
    if (!p.nodes.length && !errors.length) errors.push('Riga 1: inserisci almeno un passo');
    this.addButton.disabled = errors.length > 0;
    this.replaceButton.disabled = errors.length > 0;
    if (errors.length) {
      this.status.innerHTML = `<div class="invalid">Correggi gli errori prima di creare il diagramma.</div>` +
        `<div class="summary">Analisi: ${p.nodes.length} passi · ${p.edges.length} collegamenti · ${p.lanes.length} corsie</div>` +
        errors.map(error => {
          const line = Number(error.match(/^Riga (\d+):/)?.[1]);
          const message = esc(error);
          return Number.isInteger(line) && line > 0
            ? `<button type="button" class="import-error" data-line="${line}" aria-label="Vai alla riga ${line}: ${message}">⚠ ${message}</button>`
            : `<div class="warn">⚠ ${message}</div>`;
        }).join('');
      return;
    }
    this.status.innerHTML = `<div class="ok">✔ Diagramma valido: ${p.nodes.length} passi · ${p.edges.length} collegamenti · ${p.lanes.length} corsie</div>`;
  }

  run(mode: 'replace' | 'append'): void {
    const p = parseFlowText(this.text.value);
    const result = p.nodes.length ? buildFlowDoc(p, mode === 'append' ? `t${Date.now().toString(36)}_` : '') : null;
    const errors = [...p.errors, ...(result?.errors ?? [])];
    if (!p.nodes.length && !errors.length) errors.push('Riga 1: inserisci almeno un passo');
    if (errors.length || !result) {
      this.check();
      toast('Correggi gli errori indicati prima di creare il diagramma');
      return;
    }
    const { doc } = result;
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
