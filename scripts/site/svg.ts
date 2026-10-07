/**
 * Dependency-free SVG rendering for the docs site and README: a grouped bar chart for eval
 * results and a layered left-to-right layout for directed graphs. Output is deterministic so
 * the committed chart can be checked against a fresh render.
 */

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Greedy word wrap; words longer than the width stay on their own line. */
export function wrapText(text: string, width: number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${(kept[maxLines - 1] ?? "").replace(/\s*\S*$/, "")}...`;
    return kept;
  }
  return lines;
}

const FONT = "font-family=\"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif\"";

export interface BarSeries {
  name: string;
  color: string;
}

export interface BarGroup {
  label: string;
  /** One value per series, on a 0-100 scale. */
  values: number[];
}

export interface BarChartOptions {
  title: string;
  subtitle?: string;
  series: BarSeries[];
  groups: BarGroup[];
  width?: number;
}

/** Horizontal grouped bars on a fixed 0-100 axis, with the value printed at each bar end. */
export function barChart({ title, subtitle, series, groups, width = 760 }: BarChartOptions): string {
  const left = 190;
  const right = 56;
  const top = subtitle ? 78 : 56;
  const bar = 16;
  const gap = 4;
  const groupGap = 22;
  const groupHeight = series.length * bar + (series.length - 1) * gap;
  const plotWidth = width - left - right;
  const plotBottom = top + groups.length * groupHeight + (groups.length - 1) * groupGap;
  const legendY = plotBottom + 44;
  const height = legendY + 20;
  const x = (v: number) => left + (Math.max(0, Math.min(100, v)) / 100) * plotWidth;

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(title)}" ${FONT}>`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="24" y="32" font-size="18" font-weight="600" fill="#111827">${escapeXml(title)}</text>`,
  ];
  if (subtitle) {
    out.push(`<text x="24" y="54" font-size="13" fill="#4b5563">${escapeXml(subtitle)}</text>`);
  }
  for (const tick of [0, 25, 50, 75, 100]) {
    const tx = x(tick);
    out.push(
      `<line x1="${tx}" y1="${top - 6}" x2="${tx}" y2="${plotBottom + 6}" stroke="#e5e7eb"/>`,
      `<text x="${tx}" y="${plotBottom + 22}" font-size="11" fill="#6b7280" text-anchor="middle">${tick}</text>`,
    );
  }
  groups.forEach((group, gi) => {
    const gy = top + gi * (groupHeight + groupGap);
    const labelLines = wrapText(group.label, 24, 2);
    labelLines.forEach((line, li) => {
      const ly = gy + groupHeight / 2 + 4 + (li - (labelLines.length - 1) / 2) * 15;
      out.push(
        `<text x="${left - 12}" y="${ly}" font-size="13" fill="#111827" text-anchor="end">${escapeXml(line)}</text>`,
      );
    });
    series.forEach((s, si) => {
      const value = group.values[si] ?? 0;
      const by = gy + si * (bar + gap);
      out.push(
        `<rect x="${left}" y="${by}" width="${x(value) - left}" height="${bar}" rx="2" fill="${s.color}"><title>${escapeXml(`${group.label}: ${s.name} ${value}`)}</title></rect>`,
        `<text x="${x(value) + 6}" y="${by + bar - 4}" font-size="11" fill="#374151">${value}</text>`,
      );
    });
  });
  let lx = left;
  for (const s of series) {
    out.push(
      `<rect x="${lx}" y="${legendY - 10}" width="12" height="12" rx="2" fill="${s.color}"/>`,
      `<text x="${lx + 18}" y="${legendY}" font-size="12" fill="#374151">${escapeXml(s.name)}</text>`,
    );
    lx += 30 + s.name.length * 7;
  }
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}

export interface GraphNode {
  id: string;
  label: string;
  /** Optional group used to colour the node. */
  group?: string;
  /** Highlighted nodes get a red outline (used for dependency cycles). */
  highlight?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  dashed?: boolean;
  /** Feedback edges are drawn but ignored when assigning layers. */
  feedback?: boolean;
}

export interface GraphOptions {
  nodeWidth?: number;
  wrap?: number;
  maxLines?: number;
  palette?: Record<string, string>;
  ariaLabel: string;
  /** Prefix for element ids, so several graphs can share one HTML page. */
  idPrefix?: string;
}

export interface Layout {
  layers: string[][];
  layerOf: Map<string, number>;
}

/**
 * Longest-path layering over the non-feedback edges, then one barycenter pass per layer to
 * reduce crossings. Nodes caught in a cycle are placed after their last resolved predecessor,
 * so a cyclic input still lays out instead of looping.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): Layout {
  const ids = nodes.map((n) => n.id);
  const known = new Set(ids);
  const forward = edges.filter((e) => !e.feedback && known.has(e.from) && known.has(e.to));
  const remaining = new Map(ids.map((id) => [id, 0]));
  for (const e of forward) remaining.set(e.to, (remaining.get(e.to) ?? 0) + 1);

  // Kahn's topological order; on a cycle, release the unplaced node with the fewest
  // unresolved inputs and carry on.
  const order: string[] = [];
  const placed = new Set<string>();
  const ready = ids.filter((id) => remaining.get(id) === 0);
  while (order.length < ids.length) {
    let id = ready.shift();
    if (id === undefined) {
      id = ids
        .filter((n) => !placed.has(n))
        .sort((a, b) => (remaining.get(a) ?? 0) - (remaining.get(b) ?? 0))[0];
      if (id === undefined) break;
    }
    if (placed.has(id)) continue;
    placed.add(id);
    order.push(id);
    for (const e of forward) {
      if (e.from !== id || placed.has(e.to)) continue;
      const left = (remaining.get(e.to) ?? 0) - 1;
      remaining.set(e.to, left);
      if (left === 0) ready.push(e.to);
    }
  }

  const layerOf = new Map<string, number>();
  for (const id of order) {
    const preds = forward.filter((e) => e.to === id && layerOf.has(e.from));
    layerOf.set(id, Math.max(-1, ...preds.map((e) => layerOf.get(e.from) ?? 0)) + 1);
  }

  const depth = Math.max(0, ...layerOf.values());
  const layers: string[][] = Array.from({ length: depth + 1 }, () => []);
  for (const id of ids) layers[layerOf.get(id) ?? 0]?.push(id);
  for (let i = 1; i < layers.length; i++) {
    const prev = layers[i - 1] ?? [];
    const position = (id: string) => {
      const preds = forward.filter((e) => e.to === id).map((e) => prev.indexOf(e.from));
      const placed = preds.filter((p) => p >= 0);
      return placed.length ? placed.reduce((a, b) => a + b, 0) / placed.length : Infinity;
    };
    const order = new Map((layers[i] ?? []).map((id, idx) => [id, idx]));
    layers[i]?.sort(
      (a, b) => position(a) - position(b) || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    );
  }
  return { layers, layerOf };
}

const DEFAULT_FILL = "#eef2ff";

export function graphSvg(nodes: GraphNode[], edges: GraphEdge[], options: GraphOptions): string {
  const nodeWidth = options.nodeWidth ?? 180;
  const wrap = options.wrap ?? 24;
  const maxLines = options.maxLines ?? 3;
  const lineHeight = 15;
  const padY = 10;
  const colGap = 64;
  const rowGap = 18;
  const margin = 16;
  const arrowId = `${options.idPrefix ?? "graph"}-arrow`;

  const { layers } = layoutGraph(nodes, edges);
  const lines = new Map(nodes.map((n) => [n.id, wrapText(n.label, wrap, maxLines)]));
  const heightOf = (id: string) => (lines.get(id)?.length ?? 1) * lineHeight + padY * 2;
  const columnHeight = (layer: string[]) =>
    layer.reduce((sum, id) => sum + heightOf(id), 0) + Math.max(0, layer.length - 1) * rowGap;
  const innerHeight = Math.max(...layers.map(columnHeight), 0);
  const width = margin * 2 + layers.length * nodeWidth + Math.max(0, layers.length - 1) * colGap;
  const height = margin * 2 + innerHeight + 12;

  const box = new Map<string, { x: number; y: number; h: number }>();
  layers.forEach((layer, li) => {
    let y = margin + (innerHeight - columnHeight(layer)) / 2;
    for (const id of layer) {
      box.set(id, { x: margin + li * (nodeWidth + colGap), y, h: heightOf(id) });
      y += heightOf(id) + rowGap;
    }
  });

  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(options.ariaLabel)}" ${FONT}>`,
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#6b7280"/></marker></defs>`,
  ];
  for (const e of edges) {
    const a = box.get(e.from);
    const b = box.get(e.to);
    if (!a || !b) continue;
    const dash = e.dashed ? ` stroke-dasharray="5 4"` : "";
    let d: string;
    if (b.x > a.x) {
      const x1 = a.x + nodeWidth;
      const y1 = a.y + a.h / 2;
      const x2 = b.x;
      const y2 = b.y + b.h / 2;
      const c = (x2 - x1) / 2;
      d = `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`;
    } else {
      // Backward or same-column edge: loop below both boxes.
      const x1 = a.x + nodeWidth / 2;
      const y1 = a.y + a.h;
      const x2 = b.x + nodeWidth / 2;
      const y2 = b.y + b.h;
      const dip = Math.max(y1, y2) + 28;
      d = `M${x1},${y1} C${x1},${dip} ${x2},${dip} ${x2},${y2}`;
    }
    out.push(
      `<path d="${d}" fill="none" stroke="#6b7280" stroke-width="1.4"${dash} marker-end="url(#${arrowId})"/>`,
    );
  }
  for (const n of nodes) {
    const b = box.get(n.id);
    if (!b) continue;
    const fill = (n.group && options.palette?.[n.group]) ?? DEFAULT_FILL;
    const stroke = n.highlight ? `stroke="#c0392b" stroke-width="2.5"` : `stroke="#94a3b8"`;
    out.push(
      `<g><title>${escapeXml(n.label)}</title><rect x="${b.x}" y="${b.y}" width="${nodeWidth}" height="${b.h}" rx="6" fill="${fill}" ${stroke}/>`,
    );
    (lines.get(n.id) ?? []).forEach((line, i) => {
      const ty = b.y + padY + lineHeight * (i + 1) - 3;
      out.push(
        `<text x="${b.x + nodeWidth / 2}" y="${ty}" font-size="12" fill="#111827" text-anchor="middle">${escapeXml(line)}</text>`,
      );
    });
    out.push("</g>");
  }
  out.push("</svg>");
  return `${out.join("\n")}\n`;
}
