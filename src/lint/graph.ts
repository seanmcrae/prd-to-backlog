/** Directed-graph helpers for story dependencies (edges point from prerequisite to dependent). */

export interface Edge {
  from: string;
  to: string;
}

function adjacency(nodes: string[], edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const { from, to } of edges) {
    if (!adj.has(from)) adj.set(from, []);
    if (!adj.has(to)) adj.set(to, []);
    adj.get(from)?.push(to);
  }
  return adj;
}

/**
 * Tarjan's strongly connected components, iterative so deep chains cannot overflow the stack.
 * Components come out in reverse topological order.
 */
export function stronglyConnectedComponents(nodes: string[], edges: Edge[]): string[][] {
  const adj = adjacency(nodes, edges);
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let counter = 0;

  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    const work: { node: string; next: number }[] = [{ node: start, next: 0 }];
    index.set(start, counter);
    low.set(start, counter++);
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      if (!frame) break;
      const neighbours = adj.get(frame.node) ?? [];
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next++] ?? "";
        if (!index.has(next)) {
          index.set(next, counter);
          low.set(next, counter++);
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, next: 0 });
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node) ?? 0, index.get(next) ?? 0));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        low.set(parent.node, Math.min(low.get(parent.node) ?? 0, low.get(frame.node) ?? 0));
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string | undefined;
        do {
          member = stack.pop();
          if (member === undefined) break;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        components.push(component);
      }
    }
  }
  return components;
}

/** Every dependency cycle, as a sorted list of its members. Self-loops count. */
export function findCycles(nodes: string[], edges: Edge[]): string[][] {
  const selfLoops = new Set(edges.filter((e) => e.from === e.to).map((e) => e.from));
  return stronglyConnectedComponents(nodes, edges)
    .filter((c) => c.length > 1 || (c[0] !== undefined && selfLoops.has(c[0])))
    .map((c) => [...c].sort())
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));
}

/** Kahn's algorithm; nodes in cycles are omitted. Ties keep input order, so output is stable. */
export function topologicalOrder(nodes: string[], edges: Edge[]): string[] {
  const adj = adjacency(nodes, edges);
  const indegree = new Map<string, number>([...adj.keys()].map((n) => [n, 0]));
  for (const { to } of edges) indegree.set(to, (indegree.get(to) ?? 0) + 1);
  const queue = [...adj.keys()].filter((n) => indegree.get(n) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    order.push(node);
    for (const next of adj.get(node) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return order;
}
