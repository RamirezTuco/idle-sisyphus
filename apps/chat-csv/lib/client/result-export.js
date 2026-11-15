function resultOf(answer) {
  if (!answer?.queryResult || !Object.hasOwn(answer.queryResult, "result")) {
    throw new Error("No result is available to export.");
  }
  return answer.queryResult.result;
}

export function getTableHeaders(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (row !== null && typeof row === "object") {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  }
  return [...keys];
}

export function valueToText(value) {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function spreadsheetValue(value) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Prefix dangerous string cells, but leave numeric negatives as numbers.
  return typeof value === "string" && /^(?:\s*[=+\-@]|[\t\r\n])/.test(text) ? `'${text}` : text;
}

function quotedCell(value) {
  return `"${spreadsheetValue(value).replace(/"/g, '""')}"`;
}

function isTable(answer, data) {
  return Array.isArray(data) && (
    answer.resultType === "table" ||
    (!["list", "json", "primitive", "markdown", "text"].includes(answer.resultType) &&
      data.length > 0 && data[0] !== null && typeof data[0] === "object")
  );
}

export function buildResultDownload(answer, baseFileName = "analysis") {
  const data = resultOf(answer);
  const base = String(baseFileName || "analysis")
    .replace(/\.[^/.]+$/, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .slice(0, 150) || "analysis";
  let content;
  let suffix;
  let mimeType;
  if (answer.resultType === "markdown" || answer.resultType === "text") {
    content = valueToText(data);
    suffix = answer.resultType === "markdown" ? "_result.md" : "_result.txt";
    mimeType = answer.resultType === "markdown" ? "text/markdown" : "text/plain";
  } else if (isTable(answer, data)) {
    const headers = getTableHeaders(data);
    content = [
      headers.map(quotedCell).join(","),
      ...data.map((row) => headers.map((key) => quotedCell(row?.[key])).join(",")),
    ].join("\n") + "\n";
    suffix = `_${data.length}_rows.csv`;
    mimeType = "text/csv";
  } else if (answer.resultType === "list" && Array.isArray(data)) {
    content = data.map((item, index) => `${index + 1}. ${valueToText(item)}`).join("\n");
    suffix = `_${data.length}_items.txt`;
    mimeType = "text/plain";
  } else {
    content = JSON.stringify(data, null, 2) ?? "";
    suffix = "_result.json";
    mimeType = "application/json";
  }
  return { content, filename: `${base}${suffix}`, mimeType: `${mimeType};charset=utf-8;` };
}

export function resultToClipboard(answer) {
  const data = resultOf(answer);
  if (answer.resultType === "markdown" || answer.resultType === "text") return valueToText(data);
  if (isTable(answer, data)) {
    const headers = getTableHeaders(data);
    const cell = (value) => {
      const text = spreadsheetValue(value);
      return /[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    return [
      headers.map(cell).join("\t"),
      ...data.map((row) => headers.map((key) => cell(row?.[key])).join("\t")),
    ].join("\n");
  }
  if (answer.resultType === "list" && Array.isArray(data)) return data.map(valueToText).join("\n");
  return JSON.stringify(data, null, 2) ?? "";
}
