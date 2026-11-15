import test from "node:test";
import assert from "node:assert/strict";
import { getSettings } from "../lib/server/config.js";
import { authenticate } from "../lib/server/firebase.js";

const env = { GOOGLE_CLOUD_PROJECT: "idle-sisyphus", CHAT_CSV_ACCESS_MODE: "allowlist", CHAT_CSV_ALLOWED_UIDS: "alice", GEMINI_API_KEY: "test-key" };
const settings = getSettings(env);
const request = new Request("http://localhost/api/usage", { headers: { Authorization: "Bearer test-token" } });

test("configuration fails closed for missing model keys, limits and access policy", () => {
  assert.throws(() => getSettings({}), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, GEMINI_API_KEY: "" }, { requireModel: true }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, CHAT_CSV_ALLOWED_UIDS: "" }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, CHAT_CSV_DAILY_LIMIT: "0" }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, NODE_ENV: "production" }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, NEXT_PUBLIC_FIREBASE_PROJECT_ID: "another-project" }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, NODE_ENV: "production", CHAT_CSV_GLOBAL_DAILY_LIMIT: "100", FIRESTORE_EMULATOR_HOST: "localhost:8080" }), { code: "configuration" });
  assert.equal(settings.dailyLimit, 5);
  const vertex = getSettings({ ...env, GEMINI_API_KEY: "", GEMINI_PROVIDER: "vertex" }, { requireModel: true });
  assert.equal(vertex.modelProvider, "vertex");
  assert.equal(vertex.modelRegion, "us");
  assert.throws(() => getSettings({ ...env, GEMINI_PROVIDER: "unknown" }), { code: "configuration" });
  assert.throws(() => getSettings({ ...env, GEMINI_REGION: "invalid/region" }), { code: "configuration" });
});

test("verified Google sign-in and allowlist membership are required", async () => {
  const identity = { uid: "alice", firebase: { sign_in_provider: "google.com" } };
  const auth = { async verifyIdToken(token, checkRevoked) {
    assert.equal(token, "test-token");
    assert.equal(checkRevoked, true);
    return identity;
  } };
  assert.equal(await authenticate(request, settings, auth), identity);
  await assert.rejects(authenticate(new Request("http://localhost"), settings, auth), { status: 401 });
  await assert.rejects(authenticate(request, settings, { verifyIdToken: async () => ({ ...identity, uid: "bob" }) }), { status: 403 });
  await assert.rejects(authenticate(request, settings, { verifyIdToken: async () => ({ ...identity, firebase: { sign_in_provider: "anonymous" } }) }), { status: 403 });
  await assert.rejects(authenticate(request, settings, { verifyIdToken: async () => { throw Object.assign(new Error("expired"), { code: "auth/id-token-expired" }); } }), { status: 401 });
  await assert.rejects(authenticate(request, settings, { verifyIdToken: async () => { throw new Error("private failure details"); } }), { status: 503 });
});
