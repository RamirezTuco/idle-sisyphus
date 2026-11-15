import Papa from "papaparse";
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { LIMITS } from "../limits.js";
import { AppError } from "./errors.js";

function invalid(message) {
  return new AppError(400, "invalid_dataset", message);
}

function scalar(value) {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) return scalar(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if (typeof value.text === "string") return value.text;
    if (typeof value.error === "string") return value.error;
    throw invalid("The workbook contains an unsupported cell value.");
  }
  return String(value);
}

export function normalizeRows(rows) {
  if (!rows.length) throw invalid("The file is empty.");
  const columns = rows[0].map((cell) => scalar(cell).trim());
  if (!columns.length || columns.length > LIMITS.columns) {
    throw invalid(`Use between 1 and ${LIMITS.columns} columns.`);
  }
  if (columns.some((name) => !name || name.length > LIMITS.cellCharacters) || new Set(columns).size !== columns.length) {
    throw invalid("Column headers must be non-empty and unique.");
  }
  const data = [];
  for (const row of rows.slice(1)) {
    if (row.every((cell) => !scalar(cell).trim())) continue;
    if (row.length > columns.length) throw invalid("A data row contains more cells than the header.");
    const values = columns.map((_, index) => scalar(row[index]));
    if (values.some((value) => value.length > LIMITS.cellCharacters)) {
      throw invalid(`Cells must not exceed ${LIMITS.cellCharacters} characters.`);
    }
    data.push(Object.fromEntries(columns.map((name, index) => [name, values[index]])));
    if (data.length > LIMITS.rows) throw invalid(`Files may contain at most ${LIMITS.rows} data rows.`);
  }
  if (!data.length) throw invalid("The file must contain a header and at least one data row.");
  if (Buffer.byteLength(JSON.stringify(data)) > LIMITS.datasetBytes) {
    throw invalid("The normalized dataset is too large for analysis.");
  }
  return { columns, data };
}

async function validateArchive(buffer) {
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(invalid("The XLSX file is not a valid workbook archive."));
      let entries = 0;
      let bytes = 0;
      let finished = false;
      let activeStream;
      const fail = (message) => {
        if (finished) return;
        finished = true;
        activeStream?.destroy();
        zip.close();
        reject(invalid(message));
      };
      zip.on("error", () => fail("The XLSX archive is malformed."));
      zip.on("end", () => {
        if (!finished) { finished = true; resolve(); }
      });
      zip.on("entry", (entry) => {
        if (finished) return;
        if (++entries > LIMITS.archiveEntries || entry.generalPurposeBitFlag & 1) {
          fail("Encrypted or excessively complex workbooks are not supported.");
          return;
        }
        if (bytes + entry.uncompressedSize > LIMITS.uncompressedBytes) {
          fail("The workbook expands beyond the allowed size.");
          return;
        }
        if (entry.fileName.endsWith("/")) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (finished) { stream?.destroy(); return; }
          if (streamError) { fail("The XLSX archive could not be read."); return; }
          activeStream = stream;
          stream.on("data", (chunk) => {
            bytes += chunk.length;
            if (bytes > LIMITS.uncompressedBytes) {
              fail("The workbook expands beyond the allowed size.");
            }
          });
          stream.on("error", () => fail("The XLSX archive has invalid entry sizes."));
          stream.on("end", () => {
            activeStream = undefined;
            if (!finished) zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

export async function parseDataset(file) {
  if (!(file instanceof File) || file.size === 0) throw invalid("Upload a non-empty CSV or XLSX file.");
  if (file.size > LIMITS.uploadBytes) throw new AppError(413, "upload_too_large", "Files must be 5 MiB or smaller.");
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    if (text.includes("\0")) throw invalid("The CSV file contains binary data.");
    const parsed = Papa.parse(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
    if (parsed.errors.some((error) => error.code !== "UndetectableDelimiter")) {
      throw invalid("The CSV has invalid quoting or inconsistent structure.");
    }
    return { ...normalizeRows(parsed.data), worksheet: null };
  }
  if (!/\.xlsx$/i.test(file.name)) throw invalid("Only CSV and XLSX files are supported.");
  const buffer = Buffer.from(await file.arrayBuffer());
  await validateArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw invalid("The XLSX file could not be parsed.");
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount > LIMITS.rows + 1 || worksheet.columnCount > LIMITS.columns) {
    throw invalid("The first worksheet is empty or exceeds the row/column limits.");
  }
  const rows = [];
  for (let index = 1; index <= worksheet.rowCount; index++) {
    const row = worksheet.getRow(index);
    rows.push(Array.from({ length: row.cellCount }, (_, column) => row.getCell(column + 1).value));
  }
  return { ...normalizeRows(rows), worksheet: worksheet.name };
}

export async function readUpload(request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
    throw new AppError(415, "content_type", "Submit the file and question as multipart form data.");
  }
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMITS.bodyBytes)) {
    throw new AppError(413, "upload_too_large", "The upload request is too large.");
  }
  if (!request.body) throw invalid("The upload request is empty.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.body) {
    bytes += chunk.length;
    if (bytes > LIMITS.bodyBytes) throw new AppError(413, "upload_too_large", "The upload request is too large.");
    chunks.push(chunk);
  }
  let form;
  try {
    form = await new Request(request.url, {
      method: "POST", headers: request.headers, body: Buffer.concat(chunks)
    }).formData();
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    throw invalid("The upload request is malformed.");
  }
  const question = form.get("question");
  if (typeof question !== "string" || !question.trim() || question.length > LIMITS.questionCharacters) {
    throw invalid(`Enter a question between 1 and ${LIMITS.questionCharacters} characters.`);
  }
  return { dataset: await parseDataset(form.get("file")), question: question.trim() };
}
