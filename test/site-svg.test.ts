import { describe, expect, it } from "vitest";
import {
  barChart,
  escapeXml,
  graphSvg,
  isVirtual,
  layoutGraph,
  wrapText,
} from "../scripts/site/svg.js";

const node = (id: string) => ({ id, label: id });

describe("wrapText", () => {
  it("wraps on word boundaries", () => {
    expect(wrapText("one two three four", 9)).toEqual(["one two", "three", "four"]);
  });

  it("keeps explicit line breaks", () => {
    expect(wrapText("parser\nline spans", 40)).toEqual(["parser", "line spans"]);
  });

  it("truncates with an ellipsis past maxLines", () => {
    expect(wrapText("alpha beta gamma delta epsilon", 11, 2)).toEqual(["alpha beta", "gamma..."]);
  });
});

describe("layoutGraph", () => {
  it("puts each node one layer after its deepest predecessor", () => {
    const { layerOf } = layoutGraph(["a", "b", "c", "d"].map(node), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "a", to: "c" },
      { from: "a", to: "d" },
    ]);
    expect(Object.fromEntries(layerOf)).toEqual({ a: 0, b: 1, c: 2, d: 1 });
  });

  it("points the cycle-closing edge backwards", () => {
    const { layerOf } = layoutGraph(["gen", "llm", "repair"].map(node), [
      { from: "gen", to: "llm" },
      { from: "llm", to: "repair" },
      { from: "repair", to: "llm" },
    ]);
    expect(Object.fromEntries(layerOf)).toEqual({ gen: 0, llm: 1, repair: 2 });
  });

  it("terminates and places every node when the graph has a cycle", () => {
    const { layers } = layoutGraph(["a", "b", "c"].map(node), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "b" },
    ]);
    expect(layers.flat().sort()).toEqual(["a", "b", "c"]);
  });

  it("routes an edge that skips layers through one waypoint per crossed layer", () => {
    const { layers, waypoints } = layoutGraph(["a", "b", "c", "d"].map(node), [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
      { from: "a", to: "d" },
    ]);
    expect(waypoints.get(3)).toHaveLength(2);
    expect(layers[1]?.filter(isVirtual)).toHaveLength(1);
    expect(layers[2]?.filter(isVirtual)).toHaveLength(1);
    expect(waypoints.has(0)).toBe(false);
  });

  it("orders a layer by the position of its predecessors", () => {
    const { layers } = layoutGraph(["p", "q", "y", "x"].map(node), [
      { from: "p", to: "x" },
      { from: "q", to: "y" },
    ]);
    expect(layers[1]).toEqual(["x", "y"]);
  });
});

describe("svg output", () => {
  it("escapes markup in labels", () => {
    expect(escapeXml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    const svg = graphSvg([{ id: "n", label: "A <b> & C" }], [], { ariaLabel: "t" });
    expect(svg).toContain("A &lt;b&gt; &amp; C");
    expect(svg).not.toContain("<b>");
  });

  it("draws one path per edge and outlines highlighted nodes", () => {
    const svg = graphSvg(
      [{ ...node("a"), highlight: true }, node("b")],
      [{ from: "a", to: "b", dashed: true }],
      { ariaLabel: "deps", idPrefix: "deps" },
    );
    expect(svg.match(/marker-end=/g)).toHaveLength(1);
    expect(svg).toContain('<marker id="deps-arrow"');
    expect(svg).toContain('stroke-dasharray="5 4"');
    expect(svg).toContain('stroke="#c0392b"');
  });

  it("labels edges and grows the canvas for backward loops", () => {
    const flat = graphSvg(["a", "b"].map(node), [{ from: "a", to: "b" }], { ariaLabel: "x" });
    const looped = graphSvg(
      ["a", "b"].map(node),
      [
        { from: "a", to: "b" },
        { from: "b", to: "a", label: "retry" },
      ],
      { ariaLabel: "x" },
    );
    const heightOf = (svg: string) => Number(/height="(\d+(?:\.\d+)?)"/.exec(svg)?.[1]);
    expect(looped).toContain(">retry</text>");
    expect(heightOf(looped)).toBeGreaterThan(heightOf(flat));
  });

  it("renders a bar and value label per series and group, clamped to the axis", () => {
    const svg = barChart({
      title: "Scores",
      series: [
        { name: "one", color: "#111111" },
        { name: "two", color: "#222222" },
      ],
      groups: [
        { label: "g1", values: [50, 100] },
        { label: "g2", values: [120, 0] },
      ],
    });
    expect(svg.match(/height="16"/g)).toHaveLength(4);
    expect(svg).toContain(">120</text>");
    expect(svg).toBe(
      barChart({
        title: "Scores",
        series: [
          { name: "one", color: "#111111" },
          { name: "two", color: "#222222" },
        ],
        groups: [
          { label: "g1", values: [50, 100] },
          { label: "g2", values: [120, 0] },
        ],
      }),
    );
  });
});

describe("graph direction", () => {
  const nodes = ["a", "b", "c"].map(node);
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
  ];
  const size = (svg: string) => {
    const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    return { w: Number(m?.[1]), h: Number(m?.[2]) };
  };

  it("lays a chain out wide for LR and tall for TB", () => {
    const lr = size(graphSvg(nodes, edges, { ariaLabel: "lr" }));
    const tb = size(graphSvg(nodes, edges, { ariaLabel: "tb", direction: "TB" }));
    expect(lr.w).toBeGreaterThan(lr.h);
    expect(tb.h).toBeGreaterThan(tb.w);
  });

  it("keeps an unlabelled backward loop inside the canvas", () => {
    const svg = graphSvg(nodes, [...edges, { from: "c", to: "a" }], {
      ariaLabel: "tb",
      direction: "TB",
    });
    const { w } = size(svg);
    const xs = [...svg.matchAll(/C(\d+(?:\.\d+)?),/g)].map((m) => Number(m[1]));
    expect(Math.max(...xs)).toBeLessThanOrEqual(w);
  });
});
