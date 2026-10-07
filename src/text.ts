/** Small text utilities shared by the parser, generator and linter. */

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could do does for from has have if in into is it its " +
    "may must not of on or our shall should so such than that the their them then there these " +
    "they this to was we were what when where which while who will with within would you your " +
    "able also any each every i me my need needs per via all only other more most"
  ).split(" "),
);

/** Remove inline markdown (emphasis, code, links) while keeping the visible text. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lowercase, crude suffix-stripping stemmer: good enough for overlap scoring, not linguistics. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 4) return w;
  for (const suffix of [
    "ations",
    "ation",
    "ments",
    "ment",
    "ings",
    "ing",
    "ies",
    "ed",
    "es",
    "s",
    "e",
  ]) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      const base = w.slice(0, -suffix.length);
      return suffix === "ies" ? `${base}y` : base;
    }
  }
  return w;
}

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) ?? [];
}

/** Content-word stems, stopwords removed. */
export function contentTokens(text: string): string[] {
  return words(text)
    .filter((w) => !STOPWORDS.has(w) && w.length > 1)
    .map(stem);
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared++;
  return shared / (sa.size + sb.size - shared);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function lowerFirst(text: string): string {
  // Keep acronyms ("API", "SSO") intact.
  if (/^[A-Z]{2,}/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Truncate on a word boundary. */
export function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const idx = cut.lastIndexOf(" ");
  return `${(idx > max / 2 ? cut.slice(0, idx) : text.slice(0, max)).replace(/[,;:.\s]+$/, "")}...`;
}

export function singularize(phrase: string): string {
  return phrase.replace(/([a-z]{3,}[^s])s$/i, "$1");
}
