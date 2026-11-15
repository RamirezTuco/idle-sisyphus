import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, executeAnalysis, generateAnalysis } from "../lib/server/analysis.js";
import { LIMITS } from "../lib/limits.js";

const dataset = { columns: ["amount"], data: [{ amount: "1" }, { amount: "2" }, { amount: "3" }] };

test("analysis executes against all rows and preserves zero and false", async () => {
  const sum = await executeAnalysis('function processData(data) { return {result: data.reduce((sum, row) => sum + Number(row.amount), 0)}; }', dataset.data);
  assert.equal(sum.queryResult.result, 6);
  for (const value of ["0", "false"]) {
    const answer = await executeAnalysis(`function processData() { return {result: ${value}}; }`, []);
    assert.equal(answer.resultType, "primitive");
    assert.equal(String(answer.queryResult.result), value);
  }
});

test("Vertex Gemini uses project-scoped runtime credentials instead of an API key", async () => {
  const model = await generateAnalysis({
    model: "gemini-3.5-flash-lite", modelProvider: "vertex",
    modelRegion: "us", projectId: "idle-sisyphus", modelKey: "unused-key",
  }, dataset, "Count", new AbortController().signal, async (url, options) => {
    assert.equal(url, "https://aiplatform.googleapis.com/v1/projects/idle-sisyphus/locations/us/publishers/google/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(options.headers.Authorization, "Bearer test-access-token");
    assert.equal(options.headers["x-goog-user-project"], "idle-sisyphus");
    assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig.thinkingLevel, "MINIMAL");
    assert.equal(options.headers["x-goog-api-key"], undefined);
    assert.ok(!options.body.includes("test-access-token") && !options.body.includes("unused-key"));
    return Response.json({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "function processData(data) {return {result:data.length};}" }] } }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 },
    });
  }, () => ({ getAccessToken: async () => ({ access_token: "test-access-token" }) }));
  assert.equal(model.tokenUsage.totalTokens, 30);
});

test("the isolated interpreter exposes no Node, network or filesystem bindings", async () => {
  const answer = await executeAnalysis(`function processData() {
    return {result: [typeof process, typeof require, typeof fetch, typeof setTimeout]};
  }`, []);
  assert.deepEqual(answer.queryResult.result, ["undefined", "undefined", "undefined", "undefined"]);
  await assert.rejects(executeAnalysis("function processData() { return {result: process.env}; }", []), { code: "analysis_failed" });
});

test("execution deadlines and output limits are enforced", async () => {
  const started = Date.now();
  await assert.rejects(executeAnalysis("function processData() { while (true) {} }", [], { milliseconds: 50 }), { code: "analysis_failed" });
  assert.ok(Date.now() - started < 5000);
  await assert.rejects(executeAnalysis(`function processData() { return {result: "x".repeat(${LIMITS.resultBytes + 1})}; }`, []), { code: "result_too_large" });
  await assert.rejects(executeAnalysis("function processData() { return undefined; }", []), { code: "invalid_result" });
  await assert.rejects(executeAnalysis("function processData() { return {other: 1}; }", []), { code: "invalid_result" });
});

test("the model prompt distinguishes samples from the complete dataset", () => {
  const prompt = buildPrompt(dataset, "Count the rows");
  assert.match(prompt, /3 rows/);
  assert.match(prompt, /Analyze ALL rows/);
  assert.match(prompt, /no filesystem, network/);
});

test("Gemini requests keep the key server-side and report actual token metrics", async () => {
  const model = await generateAnalysis({ model: "gemini-2.5-flash", modelKey: "test-key" }, dataset, "Sum", new AbortController().signal,
    async (url, options) => {
      assert.match(url, /models\/gemini-2.5-flash:generateContent$/);
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      assert.ok(!options.body.includes("test-key"));
      assert.equal(JSON.parse(options.body).generationConfig.maxOutputTokens, LIMITS.outputTokens);
      return Response.json({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "```javascript\nfunction processData(data) {return {result:data.length};}\n```" }] } }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 32, thoughtsTokenCount: 2, cachedContentTokenCount: 5 }
      });
    });
  assert.deepEqual(model.tokenUsage, { inputTokens: 20, outputTokens: 12, totalTokens: 32, cachedTokens: 5 });
  assert.ok(!model.code.includes("```"));
  await assert.rejects(generateAnalysis({ model: "x", modelKey: "key" }, dataset, "Q", new AbortController().signal,
    async () => Response.json({ error: "no" }, { status: 429 })), { code: "model_unavailable" });
});
