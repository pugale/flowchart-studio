// Nome dei file salvati ed esportati (dal campo "Nome" del diagramma).
// Modulo separato da exporter.ts: così le librerie PDF restano in un file
// caricato solo al primo "Esporta" e non nel caricamento iniziale.
import type { FlowEditor } from './FlowEditor';

export const fileBase = (ed: FlowEditor) => (ed.meta.name || 'diagramma').replace(/[\\/:*?"<>|]+/g, '_');
