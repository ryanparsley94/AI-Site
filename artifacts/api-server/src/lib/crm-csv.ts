/**
 * CSV serialization for explicit, signed-in CRM exports.
 * Quotes every field and disarms spreadsheet formula injection, including
 * leading whitespace before a formula. Do not log generated customer CSVs.
 */
export function crmCsvCell(input: unknown): string {
  let text = input === null || input === undefined ? "" : String(input);
  // Protect users opening the export in Excel or another spreadsheet.
  if (/^[\u0000-\u0020\uFEFF]*[=+@-]/u.test(text)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

export function crmCsvDocument(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [headers, ...rows].map((row) => row.map(crmCsvCell).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
