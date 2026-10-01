/**
 * CSV for Brazilian spreadsheets: ';' separator (',' is the decimal mark),
 * CRLF line ends and a UTF-8 BOM so Excel shows accents correctly.
 */
export const CSV_BOM = '﻿';
const SEPARATOR = ';';

/**
 * Spreadsheet formula injection: a cell starting with = + - @ (or tab/CR) is
 * executed as a formula by Excel/Sheets, e.g. =HYPERLINK("http://evil",...).
 * Text cells get a leading apostrophe, which spreadsheets show as plain text.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180 quoting: wrap in quotes when needed, double inner quotes. */
export function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvCell = { text: string } | { number: string };

/** Text cells are neutralized; number cells (already formatted) are not. */
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const line = (cells: string[]) => cells.join(SEPARATOR);
  const body = rows.map((row) =>
    line(row.map((cell) => ('text' in cell ? escapeCell(neutralizeFormula(cell.text)) : escapeCell(cell.number)))),
  );
  return CSV_BOM + [line(header.map(escapeCell)), ...body].join('\r\n') + '\r\n';
}

/** "-1234.50" -> "-1234,50" (no thousands separator: stays a number in Excel). */
export function brDecimal(value: string): string {
  return value.replace('.', ',');
}
