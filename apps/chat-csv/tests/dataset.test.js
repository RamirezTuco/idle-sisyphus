import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { normalizeRows, parseDataset, readUpload } from "../lib/server/dataset.js";
import { LIMITS } from "../lib/limits.js";

test("CSV parsing preserves values, quotes and blank-line handling", async () => {
  const result = await parseDataset(new File(['\uFEFFname,value\n"Ada, A",0\n\nBob,12\n'], "data.csv"));
  assert.deepEqual(result.columns, ["name", "value"]);
  assert.deepEqual(result.data, [{ name: "Ada, A", value: "0" }, { name: "Bob", value: "12" }]);
  const single = await parseDataset(new File(["name\nAda\nBob\n"], "one.csv"));
  assert.equal(single.data.length, 2);
});

test("invalid and oversized CSV inputs fail before analysis", async () => {
  for (const text of ["", "name\n", "name,name\nA,B", 'a,b\n"unterminated,2', "a,b\n1,2,3", "a,\n1,2"]) {
    await assert.rejects(parseDataset(new File([text], "data.csv")), (error) => error.status === 400);
  }
  await assert.rejects(parseDataset(new File(["binary\0data"], "data.csv")), { code: "invalid_dataset" });
  await assert.rejects(parseDataset(new File([new Uint8Array(LIMITS.uploadBytes + 1)], "large.csv")), { status: 413 });
  await assert.rejects(parseDataset(new File(["data"], "data.xls")), { status: 400 });
  assert.throws(() => normalizeRows([["a"], ...Array.from({ length: LIMITS.rows + 1 }, () => ["1"])]), /at most/);
  assert.throws(() => normalizeRows([["a"], ["x".repeat(LIMITS.cellCharacters + 1)]]), /Cells/);
});

test("XLSX uses the first worksheet and cached formula values", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Data");
  sheet.addRow(["name", "value"]);
  sheet.addRow(["Ada", 0]);
  sheet.addRow(["Bob", { formula: "1+1", result: 2 }]);
  book.addWorksheet("Other").addRow(["ignored"]);
  const bytes = await book.xlsx.writeBuffer();
  const result = await parseDataset(new File([bytes], "data.xlsx"));
  assert.equal(result.worksheet, "Data");
  assert.deepEqual(result.data, [{ name: "Ada", value: "0" }, { name: "Bob", value: "2" }]);
  await assert.rejects(parseDataset(new File(["not a zip"], "bad.xlsx")), { status: 400 });
});

test("multipart input is bounded and validates questions", async () => {
  const form = new FormData();
  form.set("file", new File(["a\n1"], "data.csv"));
  form.set("question", "Count the rows");
  const result = await readUpload(new Request("http://localhost/api/ask_csv", { method: "POST", body: form }));
  assert.equal(result.question, "Count the rows");
  assert.equal(result.dataset.data.length, 1);
  form.set("question", "x".repeat(LIMITS.questionCharacters + 1));
  await assert.rejects(readUpload(new Request("http://localhost/api/ask_csv", { method: "POST", body: form })), { status: 400 });
  await assert.rejects(readUpload(new Request("http://localhost/api/ask_csv", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(LIMITS.bodyBytes + 1) }, body: "x"
  })), { status: 413 });
});

test("compressed workbook expansion is rejected before worksheet parsing", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Data").addRow(["x".repeat(LIMITS.uncompressedBytes + 1)]);
  const bytes = await book.xlsx.writeBuffer({ zip: { zlib: { level: 9 } } });
  assert.ok(bytes.length < LIMITS.uploadBytes);
  await assert.rejects(parseDataset(new File([bytes], "expanded.xlsx")), /expands beyond/);
});
