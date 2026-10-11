// =====================================================================
//  Salva / apri file JSON (File System Access API se disponibile:
//  Edge, Chrome ed Electron permettono di risalvare sullo stesso file)
// =====================================================================
import { parseDocJson } from '../core/docIO';
import type { FlowEditor } from '../editor/FlowEditor';
import { fileBase } from '../editor/fileName';
import { $, toast } from './dom';

interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
}
interface FsWindow {
  showSaveFilePicker?: (o: unknown) => Promise<FileHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<FileHandle[]>;
}
const fsw = window as unknown as FsWindow;
const TYPES = [{ description: 'Diagramma JSON', accept: { 'application/json': ['.json'] } }];
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';

export class FileOps {
  private handle: FileHandle | null = null;
  private readonly input = $<HTMLInputElement>('#file-input');

  constructor(private readonly ed: FlowEditor, private readonly afterLoad: () => void) {
    this.input.addEventListener('change', async () => {
      const f = this.input.files?.[0];
      if (f) this.load(await f.text(), null);
      this.input.value = '';
    });
  }

  async save(saveAs = false): Promise<void> {
    this.ed.graph.stopEditing(false);
    const data = JSON.stringify(this.ed.toDoc(), null, 2);
    const name = fileBase(this.ed) + '.json';
    if (fsw.showSaveFilePicker) {
      try {
        if (!this.handle || saveAs) this.handle = await fsw.showSaveFilePicker({ suggestedName: name, types: TYPES });
        const w = await this.handle.createWritable();
        await w.write(data);
        await w.close();
        toast('Salvato: ' + this.handle.name);
        return;
      } catch (e) {
        if (isAbort(e)) return;
        console.warn('Salvataggio diretto non riuscito, uso il download', e);
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('File JSON scaricato');
  }

  async open(): Promise<void> {
    if (fsw.showOpenFilePicker) {
      try {
        const [h] = await fsw.showOpenFilePicker({ types: TYPES });
        this.load(await (await h.getFile()).text(), h);
        return;
      } catch (e) { if (isAbort(e)) return; }
    }
    this.input.click();
  }

  load(text: string, handle: FileHandle | null): boolean {
    try {
      const doc = parseDocJson(text);
      this.handle = handle;
      this.ed.loadDoc(doc);
    } catch (e) {
      alert('Impossibile aprire il file: ' + (e as Error).message);
      return false;
    }
    this.afterLoad();
    toast('Diagramma caricato');
    return true;
  }

  forget(): void { this.handle = null; }
}
