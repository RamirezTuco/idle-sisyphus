import test from "node:test";
import assert from "node:assert/strict";
import { buildResultDownload, resultToClipboard } from "../lib/client/result-export.js";

test("zero and false remain downloadable and copyable", () => {
  for (const result of [0, false]) {
    const answer = { queryResult: { result }, resultType: "primitive" };
    assert.equal(buildResultDownload(answer, "data.csv").content, String(result));
    assert.equal(resultToClipboard(answer), String(result));
  }
});

test("CSV exports quote cells, include all headers and neutralize formulas", () => {
  const answer = { resultType: "table", queryResult: { result: [
    { name: 'Ada, "A"', value: "=1+1", numeric: -1 },
    { name: "Bob", value: "@SUM(A1)", extra: "later column" }
  ] } };
  const output = buildResultDownload(answer, "data.csv");
  assert.match(output.filename, /\.csv$/);
  assert.match(output.content, /"extra"/);
  assert.match(output.content, /"Ada, ""A"""/);
  assert.ok(output.content.includes("\"'=1+1\""));
  assert.ok(output.content.includes('"-1"'));
  assert.ok(resultToClipboard(answer).includes("'@SUM"));
});

test("spreadsheet exports protect whitespace-prefixed formulas and headers", () => {
  const answer = { resultType: "table", queryResult: { result: [
    { " =header": "\n=1+1", value: " \t@SUM(A1)", numeric: -2 },
  ] } };
  assert.ok(buildResultDownload(answer).content.includes("\"' =header\""));
  assert.ok(buildResultDownload(answer).content.includes("\"'\n=1+1\""));
  assert.ok(resultToClipboard(answer).includes("' \t@SUM"));
  assert.ok(resultToClipboard(answer).includes("\t-2"));
});
