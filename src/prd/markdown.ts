/**
 * Line-accurate markdown reader for PRDs.
 *
 * It covers the block constructs PRDs actually use (ATX/setext headings, nested lists, task
 * lists, tables, paragraphs, block quotes, fenced code, YAML front matter) and records the
 * 1-based source lines of every block so requirements can be traced back to the document.
 * Inline markup is stripped from block text; it carries no structure we need.
 */
import { stripInlineMarkdown } from "../text.js";

export interface SourceSpan {
  line: number;
  endLine: number;
}

export interface ListItemBlock extends SourceSpan {
  kind: "listItem";
  text: string;
  ordered: boolean;
  checked?: boolean;
  children: ListItemBlock[];
}

export interface ParagraphBlock extends SourceSpan {
  kind: "paragraph";
  text: string;
  quote: boolean;
}

export interface TableBlock extends SourceSpan {
  kind: "table";
  header: string[];
  rows: { cells: string[]; line: number }[];
}

export type Block = ListItemBlock | ParagraphBlock | TableBlock;

export interface Section extends SourceSpan {
  title: string;
  level: number;
  /** Titles of ancestor sections followed by this one. */
  path: string[];
  blocks: Block[];
  children: Section[];
}

export interface MarkdownDocument {
  title: string;
  frontMatter: Record<string, string>;
  /** Virtual level-0 root; content before the first heading lives in its blocks. */
  root: Section;
  lineCount: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const SETEXT = /^\s{0,3}(=+|-+)\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TASK = /^\[( |x|X)\]\s+/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => stripInlineMarkdown(c.replace(/\\\|/g, "|")));
}

function indentWidth(ws: string): number {
  return ws.replace(/\t/g, "    ").length;
}

function parseFrontMatter(lines: string[]): { data: Record<string, string>; next: number } {
  const data: Record<string, string> = {};
  if (lines[0]?.trim() !== "---") return { data, next: 0 };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") return { data, next: i + 1 };
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m?.[1]) data[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  // Unterminated front matter: treat the whole thing as content.
  return { data: {}, next: 0 };
}

export function parseMarkdown(source: string): MarkdownDocument {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const { data: frontMatter, next } = parseFrontMatter(lines);

  const root: Section = {
    title: "",
    level: 0,
    path: [],
    line: 1,
    endLine: lines.length,
    blocks: [],
    children: [],
  };
  const stack: Section[] = [root];
  const current = (): Section => stack[stack.length - 1] ?? root;

  let paragraph: { text: string[]; line: number; endLine: number; quote: boolean } | null = null;
  let listStack: { indent: number; item: ListItemBlock }[] = [];
  let lastItem: ListItemBlock | null = null;

  const flushParagraph = (): void => {
    if (!paragraph) return;
    current().blocks.push({
      kind: "paragraph",
      text: stripInlineMarkdown(paragraph.text.join(" ")),
      quote: paragraph.quote,
      line: paragraph.line,
      endLine: paragraph.endLine,
    });
    paragraph = null;
  };
  const endList = (): void => {
    listStack = [];
    lastItem = null;
  };

  const openSection = (title: string, level: number, line: number): void => {
    flushParagraph();
    endList();
    while (stack.length > 1 && current().level >= level) {
      const closed = stack.pop();
      if (closed) closed.endLine = line - 1;
    }
    const parent = current();
    const section: Section = {
      title: stripInlineMarkdown(title),
      level,
      path: [...parent.path, stripInlineMarkdown(title)],
      line,
      endLine: lines.length,
      blocks: [],
      children: [],
    };
    parent.children.push(section);
    stack.push(section);
  };

  for (let i = next; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;

    const fence = FENCE.exec(raw);
    if (fence?.[1]) {
      flushParagraph();
      endList();
      const marker = fence[1];
      while (i + 1 < lines.length && !(lines[i + 1] ?? "").trim().startsWith(marker)) i++;
      i++; // closing fence
      continue;
    }

    if (raw.trim() === "") {
      flushParagraph();
      // A blank line does not end a list; a following non-indented paragraph does.
      continue;
    }

    const atx = ATX.exec(raw);
    if (atx?.[1]) {
      openSection(atx[2] ?? "", atx[1].length, lineNo);
      continue;
    }

    const setext = SETEXT.exec(raw);
    if (setext?.[1] && paragraph && !paragraph.quote && paragraph.text.length === 1) {
      const title = paragraph.text[0] ?? "";
      const start = paragraph.line;
      paragraph = null;
      openSection(title, setext[1].startsWith("=") ? 1 : 2, start);
      continue;
    }

    if (HR.test(raw)) {
      flushParagraph();
      endList();
      continue;
    }

    if (TABLE_ROW.test(raw) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flushParagraph();
      endList();
      const table: TableBlock = {
        kind: "table",
        header: splitRow(raw),
        rows: [],
        line: lineNo,
        endLine: lineNo + 1,
      };
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i] ?? "")) {
        table.rows.push({ cells: splitRow(lines[i] ?? ""), line: i + 1 });
        table.endLine = i + 1;
        i++;
      }
      i--;
      current().blocks.push(table);
      continue;
    }

    const item = LIST_ITEM.exec(raw);
    if (item) {
      flushParagraph();
      const indent = indentWidth(item[1] ?? "");
      let text = item[3] ?? "";
      let checked: boolean | undefined;
      const task = TASK.exec(text);
      if (task) {
        checked = task[1] !== " ";
        text = text.slice(task[0].length);
      }
      const block: ListItemBlock = {
        kind: "listItem",
        text: stripInlineMarkdown(text),
        ordered: /\d/.test(item[2] ?? ""),
        children: [],
        line: lineNo,
        endLine: lineNo,
        ...(checked === undefined ? {} : { checked }),
      };
      while (listStack.length > 0 && (listStack[listStack.length - 1]?.indent ?? 0) >= indent) {
        listStack.pop();
      }
      const parent = listStack[listStack.length - 1];
      if (parent) {
        parent.item.children.push(block);
        // Extend every open ancestor so spans cover their nested items.
        for (const open of listStack) open.item.endLine = lineNo;
      } else {
        current().blocks.push(block);
      }
      listStack.push({ indent, item: block });
      lastItem = block;
      continue;
    }

    // Lazy continuation of a list item: indented text directly under it.
    if (lastItem && /^\s+\S/.test(raw) && !paragraph) {
      lastItem.text = stripInlineMarkdown(`${lastItem.text} ${raw.trim()}`);
      for (const open of listStack) open.item.endLine = lineNo;
      continue;
    }

    endList();
    const quote = /^\s{0,3}>\s?/.test(raw);
    const text = raw.replace(/^\s{0,3}>\s?/, "").trim();
    if (paragraph && paragraph.quote === quote) {
      paragraph.text.push(text);
      paragraph.endLine = lineNo;
    } else {
      flushParagraph();
      paragraph = { text: [text], line: lineNo, endLine: lineNo, quote };
    }
  }
  flushParagraph();

  const firstH1 = root.children.find((s) => s.level === 1);
  const title = frontMatter.title ?? firstH1?.title ?? "Untitled PRD";
  return { title, frontMatter, root, lineCount: lines.length };
}

/** Depth-first walk over every section below (and excluding) the root. */
export function* walkSections(section: Section): Generator<Section> {
  for (const child of section.children) {
    yield child;
    yield* walkSections(child);
  }
}
