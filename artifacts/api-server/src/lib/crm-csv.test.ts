import assert from "node:assert/strict";
import test from "node:test";
import { crmCsvCell, crmCsvDocument } from "./crm-csv";

test("quotes commas, embedded quotes and line breaks in customer data", () => {
  assert.equal(crmCsvCell('12 "Main" Street, Maldon'), '"12 ""Main"" Street, Maldon"');
  assert.equal(crmCsvCell("First line\nSecond line"), '"First line\nSecond line"');
  assert.equal(crmCsvCell(null), '""');
});

test("disarms spreadsheet formulas, even after whitespace", () => {
  for (const field of ["=HYPERLINK(\"https://example.test\")", "+SUM(1,2)", "-1+2", "@SUM(2,2)", "  =1+1", "\t@1"]) {
    assert.equal(crmCsvCell(field), '"' + "'" + field.replace(/"/g, '""') + '"');
  }
  assert.equal(crmCsvCell("A regular note"), '"A regular note"');
});

test("produces a UTF-8 BOM, ordered columns and CRLF endings", () => {
  assert.equal(
    crmCsvDocument(["Customer Name", "Notes"], [["Example Customer", "Socket replacement"]]),
    '\uFEFF"Customer Name","Notes"\r\n"Example Customer","Socket replacement"\r\n',
  );
});
