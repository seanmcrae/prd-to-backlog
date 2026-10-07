/** RFC 4180 CSV: quote fields containing separators, quotes or newlines; CRLF row endings. */
export function toCsv(rows: string[][]): string {
  const field = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  return rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}
