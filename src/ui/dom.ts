// Piccole utilità per l'interfaccia
import { toHex } from '../core/styles';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error('Elemento mancante: ' + sel);
  return el;
};

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, c => ESC[c]);

let toastTimer = 0;
export function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 3000);
}

/* ---------- Campi del pannello proprietà ----------
   data-scope = a cosa si applica (node, lane, edge, settings, legend, meta, desc)
   data-k     = chiave da modificare                                          */
const at = (scope: string, k: string) => `data-scope="${scope}" data-k="${esc(k)}"`;
const round = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export const fColor = (scope: string, k: string, label: string, v: unknown) =>
  `<label class="f"><span>${label}</span><input type="color" ${at(scope, k)} value="${toHex(v)}"></label>`;
export const fNum = (scope: string, k: string, label: string, v: unknown, min = 0, max = 9999, step = 1) =>
  `<label class="f"><span>${label}</span><input type="number" ${at(scope, k)} value="${round(v)}" min="${min}" max="${max}" step="${step}"></label>`;
export const fText = (scope: string, k: string, label: string, v: unknown) =>
  `<label class="f col"><span>${label}</span><input type="text" ${at(scope, k)} value="${esc(v)}"></label>`;
export const fArea = (scope: string, k: string, label: string, v: unknown) =>
  `<label class="f col"><span>${label}</span><textarea ${at(scope, k)} rows="3">${esc(v)}</textarea></label>`;
export const fSel = (scope: string, k: string, label: string, v: unknown, opts: readonly (readonly [string, string])[]) =>
  `<label class="f col"><span>${label}</span><select ${at(scope, k)}>${opts.map(([val, lab]) =>
    `<option value="${esc(val)}"${val === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select></label>`;
export const fChk = (scope: string, k: string, label: string, v: unknown) =>
  `<label class="f chk"><input type="checkbox" ${at(scope, k)}${v ? ' checked' : ''}><span>${label}</span></label>`;
export const row2 = (a: string, b: string) => `<div class="row2">${a}${b}</div>`;

export type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export function readInput(el: Field): string | number | boolean {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.type === 'range') return el.valueAsNumber;
  }
  return el.value;
}
