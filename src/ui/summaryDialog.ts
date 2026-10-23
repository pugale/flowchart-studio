import { buildDiagramSummary } from '../core/summaryText';
import type { FlowEditor } from '../editor/FlowEditor';
import { $, toast } from './dom';

export class SummaryDialog {
  private readonly modal = $('#summary-modal');
  private readonly text = $<HTMLTextAreaElement>('#summary-text');

  constructor(private readonly ed: FlowEditor) {
    this.text.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.modal.addEventListener('pointerdown', e => { if (e.target === this.modal) this.close(); });
  }

  get isOpen(): boolean { return !this.modal.hidden; }

  open(): void {
    this.ed.graph.stopEditing(false);
    const doc = this.ed.toDoc();
    if (!doc.nodes.some(node => node.type !== 'title')) {
      toast('Aggiungi almeno un passo prima di generare il riepilogo');
      return;
    }
    this.text.value = buildDiagramSummary(doc);
    this.modal.hidden = false;
    this.text.focus();
    this.text.select();
  }

  close(): void { this.modal.hidden = true; }

  async copy(): Promise<void> {
    this.text.focus();
    this.text.select();
    if (!navigator.clipboard?.writeText) {
      toast('Testo selezionato: copialo con Ctrl+C');
      return;
    }
    try {
      await navigator.clipboard.writeText(this.text.value);
      toast('Riepilogo copiato negli appunti');
    } catch (error) {
      console.error('Copia del riepilogo non riuscita', error);
      toast('Copia non riuscita: il testo è selezionato, premi Ctrl+C');
    }
  }
}
