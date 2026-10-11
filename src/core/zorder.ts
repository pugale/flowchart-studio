// =====================================================================
//  Ordine di disegno: le corsie stanno sempre sotto a tutto il resto.
//  Modulo puro: lavora su qualsiasi elenco, testabile senza maxGraph.
// =====================================================================

/**
 * Restituisce l'elenco riordinato con gli elementi "di sfondo" all'inizio
 * (mantenendo l'ordine relativo di ciascun gruppo), oppure null se è già in ordine.
 */
export function backgroundFirst<T>(items: readonly T[], isBackground: (item: T) => boolean): T[] | null {
  const back = items.filter(isBackground);
  if (!back.length || items.slice(0, back.length).every(isBackground)) return null;
  return [...back, ...items.filter(i => !isBackground(i))];
}
