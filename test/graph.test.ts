import { describe, expect, it } from "vitest";
import { findCycles, stronglyConnectedComponents, topologicalOrder } from "../src/lint/graph.js";

const e = (from: string, to: string) => ({ from, to });

describe("dependency graph", () => {
  it("finds no cycles in a DAG", () => {
    expect(findCycles(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("a", "c")])).toEqual([]);
  });

  it("finds a simple cycle", () => {
    expect(findCycles(["a", "b", "c"], [e("a", "b"), e("b", "c"), e("c", "a")])).toEqual([
      ["a", "b", "c"],
    ]);
  });

  it("separates independent cycles and ignores acyclic tails", () => {
    const edges = [e("a", "b"), e("b", "a"), e("b", "x"), e("x", "y"), e("y", "z"), e("z", "x")];
    expect(findCycles(["a", "b", "x", "y", "z", "lonely"], edges)).toEqual([
      ["a", "b"],
      ["x", "y", "z"],
    ]);
  });

  it("reports self-loops", () => {
    expect(findCycles(["a"], [e("a", "a")])).toEqual([["a"]]);
  });

  it("partitions every node into exactly one component", () => {
    const comps = stronglyConnectedComponents(["a", "b", "c", "d"], [e("a", "b"), e("b", "a")]);
    expect(comps.flat().sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("handles long chains without recursion limits", () => {
    const nodes = Array.from({ length: 20000 }, (_, i) => `n${i}`);
    const edges = nodes.slice(1).map((n, i) => e(nodes[i] ?? "", n));
    edges.push(e("n19999", "n0"));
    expect(findCycles(nodes, edges)[0]).toHaveLength(20000);
  });

  it("orders prerequisites first and drops cyclic nodes", () => {
    expect(topologicalOrder(["c", "b", "a"], [e("a", "b"), e("b", "c")])).toEqual(["a", "b", "c"]);
    expect(topologicalOrder(["a", "b", "c"], [e("a", "b"), e("b", "a")])).toEqual(["c"]);
  });
});
