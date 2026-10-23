import type { DocLane, DocNode, FlowDoc } from './types';

const labelOf = (node: DocNode) => node.text.replace(/\s+/g, ' ').trim() || 'passo senza etichetta';

export function buildDiagramSummary(doc: FlowDoc): string {
  const nodes = doc.nodes.filter(node => node.type !== 'title');
  const title = doc.nodes.find(node => node.type === 'title')?.text.trim() || doc.name || 'Diagramma';
  if (!nodes.length) return `${title}\n\nIl diagramma è vuoto.`;

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const connectedEdges = doc.edges.filter(edge => edge.source && edge.target && nodeById.has(edge.source) && nodeById.has(edge.target));
  const laneById = new Map(doc.lanes.map(lane => [lane.id, lane]));
  const laneGroups = new Map<string | null, DocNode[]>();
  for (const node of nodes) {
    const group = laneGroups.get(node.parent) ?? [];
    group.push(node);
    laneGroups.set(node.parent, group);
  }
  const laneOf = (node: DocNode): DocLane | undefined => node.parent ? laneById.get(node.parent) : undefined;
  const orderedGroups = [...laneGroups.entries()].sort(([a], [b]) => {
    if (a === null) return b === null ? 0 : -1;
    if (b === null) return 1;
    return doc.lanes.findIndex(lane => lane.id === a) - doc.lanes.findIndex(lane => lane.id === b);
  });

  const lines = [
    title,
    '',
    `Il diagramma descrive un processo con ${nodes.length} ${nodes.length === 1 ? 'passo' : 'passi'} e ${connectedEdges.length} ${connectedEdges.length === 1 ? 'collegamento' : 'collegamenti'}.`,
    '',
    'Passaggi e collegamenti:'
  ];

  for (const [laneId, group] of orderedGroups) {
    const lane = laneId ? laneById.get(laneId) : undefined;
    if (lane) lines.push('', `Area: ${lane.name}`);
    group.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const node of group) {
      const outgoing = connectedEdges.filter(edge => edge.source === node.id);
      if (!outgoing.length) {
        const incoming = connectedEdges.some(edge => edge.target === node.id);
        lines.push(`- ${labelOf(node)}: ${incoming ? 'non sono indicati passaggi successivi' : 'non risulta collegato ad altri passi'}.`);
        continue;
      }
      const destinations = outgoing.map(edge => {
        const target = nodeById.get(edge.target!)!;
        const targetLane = laneOf(target);
        const area = targetLane && targetLane.id !== laneId ? ` (area: ${targetLane.name})` : '';
        const label = edge.label.trim() ? ` (etichetta: ${edge.label.trim()})` : '';
        return `${labelOf(target)}${area}${label}`;
      });
      const joined = destinations.length === 1
        ? destinations[0]
        : `${destinations.slice(0, -1).join('; ')} e ${destinations.at(-1)}`;
      lines.push(`- ${labelOf(node)}: il flusso prosegue verso ${joined}.`);
    }
  }

  const freeEdges = doc.edges.length - connectedEdges.length;
  if (freeEdges > 0) {
    lines.push('', `Nota: il diagramma contiene ${freeEdges} ${freeEdges === 1 ? 'freccia libera o non collegata' : 'frecce libere o non collegate'} non riportate nel riepilogo.`);
  }
  return lines.join('\n');
}
