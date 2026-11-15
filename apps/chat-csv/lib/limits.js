export const LIMITS = Object.freeze({
  uploadBytes: 5 * 1024 * 1024,
  bodyBytes: 5 * 1024 * 1024 + 64 * 1024,
  uncompressedBytes: 32 * 1024 * 1024,
  archiveEntries: 1000,
  rows: 20_000,
  columns: 64,
  cellCharacters: 2000,
  datasetBytes: 10 * 1024 * 1024,
  questionCharacters: 2000,
  sampleCharacters: 24_000,
  codeCharacters: 65_536,
  resultBytes: 1024 * 1024,
  executionMilliseconds: 2000,
  executionMemoryBytes: 128 * 1024 * 1024,
  modelMilliseconds: 60_000,
  outputTokens: 8192
});
