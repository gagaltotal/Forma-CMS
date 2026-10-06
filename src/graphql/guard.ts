import { Kind, type DocumentNode, type SelectionSetNode } from 'graphql';
import { GRAPHQL } from '../config/constants.js';

/** Ukur kedalaman & jumlah node, dengan anggaran kunjungan agar "fragment bomb" tidak menghabiskan CPU. */
function measure(doc: DocumentNode): { depth: number; nodes: number; tooComplex: boolean } {
  const frags = new Map<string, SelectionSetNode>();
  for (const d of doc.definitions) if (d.kind === Kind.FRAGMENT_DEFINITION) frags.set(d.name.value, d.selectionSet);
  let nodes = 0, visits = 0, tooComplex = false;
  const walk = (set: SelectionSetNode, depth: number): number => {
    let max = depth;
    for (const s of set.selections) {
      if (++visits > GRAPHQL.MAX_VISITS) { tooComplex = true; return max; }
      if (s.kind === Kind.FIELD) {
        nodes++;
        max = Math.max(max, s.selectionSet ? walk(s.selectionSet, depth + 1) : depth + 1);
      } else if (s.kind === Kind.INLINE_FRAGMENT) {
        max = Math.max(max, walk(s.selectionSet, depth));
      } else {
        const fr = frags.get(s.name.value);
        if (fr) max = Math.max(max, walk(fr, depth));
      }
    }
    return max;
  };
  let depth = 0;
  for (const d of doc.definitions) if (d.kind === Kind.OPERATION_DEFINITION) depth = Math.max(depth, walk(d.selectionSet, 0));
  return { depth, nodes, tooComplex };
}


/** Pesan error jika query melewati batas kompleksitas; null jika aman. */
export function complexityViolation(doc: DocumentNode): string | null {
  const m = measure(doc);
  if (m.tooComplex || m.depth > GRAPHQL.MAX_DEPTH || m.nodes > GRAPHQL.MAX_NODES) {
    return `Query too complex (max depth ${GRAPHQL.MAX_DEPTH}, max ${GRAPHQL.MAX_NODES} fields)`;
  }
  return null;
}
