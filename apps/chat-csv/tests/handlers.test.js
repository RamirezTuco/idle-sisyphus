import test from "node:test";
import assert from "node:assert/strict";
import { createHandlers } from "../lib/server/handlers.js";
import { AppError } from "../lib/server/errors.js";

const request = () => new Request("http://localhost/api/ask_csv", { method: "POST", headers: { Authorization: "Bearer token" } });
const usage = { used: 1, limit: 5, remaining: 4, date: "2026-11-15" };
function harness(overrides = {}) {
  const calls = [];
  return {
    calls,
    handler: createHandlers({
      settingsFor: () => ({}),
      servicesFor: () => ({ auth: {}, db: {} }),
      verify: async () => { calls.push("verify"); return { uid: "alice" }; },
      upload: async () => ({ dataset: { columns: ["a"], data: [{ a: "1" }], worksheet: null }, question: "Count" }),
      reserve: async () => { calls.push("reserve"); return { usage }; },
      generate: async () => { calls.push("model"); return { code: "function processData(data){return {result:data.length};}", tokenUsage: {} }; },
      execute: async () => ({ queryResult: { result: 1 }, resultType: "primitive" }),
      record: async () => { calls.push("record"); },
      finish: async (_, success) => { calls.push(success ? "succeeded" : "failed"); },
      readUsage: async () => usage,
      logger: { error: () => undefined },
      ...overrides
    })
  };
}

test("unauthenticated requests cannot parse uploads or call the model", async () => {
  const { handler, calls } = harness();
  const response = await handler.POST(new Request("http://localhost/api/ask_csv", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("accepted requests reserve usage before spending and preserve the response protocol", async () => {
  const { handler, calls } = harness();
  const response = await handler.POST(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["verify", "reserve", "model", "record", "succeeded"]);
  assert.equal((await response.json()).queryResult.result, 1);
});

test("validation or quota failure does not call the model", async () => {
  for (const override of [
    { upload: async () => { throw new AppError(400, "invalid_dataset", "Bad file"); } },
    { reserve: async () => { throw new AppError(429, "daily_limit", "Limit"); } }
  ]) {
    const { handler, calls } = harness(override);
    const response = await handler.POST(request());
    assert.ok([400, 429].includes(response.status));
    assert.ok(!calls.includes("model"));
    if (response.status === 429) assert.ok(Number(response.headers.get("retry-after")) > 0);
  }
});

test("provider failure retains the reservation and records failure explicitly", async () => {
  const { handler, calls } = harness({
    generate: async () => { throw new AppError(502, "model_unavailable", "Model unavailable"); }
  });
  assert.equal((await handler.POST(request())).status, 502);
  assert.deepEqual(calls, ["verify", "reserve", "failed"]);
});

test("persistence errors are surfaced and unknown details are not returned", async () => {
  const { handler } = harness({
    generate: async () => { throw new Error("internal secret detail"); },
    finish: async () => { throw new Error("store detail"); }
  });
  const response = await handler.POST(request());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "usage_unavailable");
  assert.ok(!body.error.includes("secret"));
});
