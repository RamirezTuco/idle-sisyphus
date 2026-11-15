import test from "node:test";
import assert from "node:assert/strict";
import { reserveUsage, getUsage, recordTokens } from "../lib/server/usage.js";

class MemoryDatabase {
  data = new Map();
  queue = Promise.resolve();
  writes = 0;
  collection(path) {
    const db = this;
    return { doc(id) {
      const key = `${path}/${id}`;
      return {
        key,
        collection(child) { return db.collection(`${key}/${child}`); },
        async get() { return db.snapshot(key); },
        async update(value) { db.data.set(key, { ...db.data.get(key), ...value }); }
      };
    } };
  }
  snapshot(key) { return { exists: this.data.has(key), data: () => this.data.get(key) }; }
  runTransaction(action) {
    const run = this.queue.then(() => action({
      get: async (ref) => this.snapshot(ref.key),
      set: (ref, value) => { this.writes++; this.data.set(ref.key, { ...this.data.get(ref.key), ...value }); },
      create: (ref, value) => { assert.ok(!this.data.has(ref.key)); this.data.set(ref.key, value); },
      update: (ref, value) => { this.data.set(ref.key, { ...this.data.get(ref.key), ...value }); }
    }));
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }
}

const settings = { dailyLimit: 5, globalDailyLimit: 10, retentionDays: 7 };
const now = new Date("2026-11-15T12:00:00Z");

test("concurrent query reservations cannot exceed the per-user allowance", async () => {
  const db = new MemoryDatabase();
  const requests = await Promise.allSettled(Array.from({ length: 20 }, (_, index) => reserveUsage(db, "alice", settings, String(index), now)));
  assert.equal(requests.filter((request) => request.status === "fulfilled").length, 5);
  assert.deepEqual(await getUsage(db, "alice", settings, now), { used: 5, limit: 5, remaining: 0, date: "2026-11-15" });
  assert.equal((await getUsage(db, "alice", settings, new Date("2026-11-16T00:00:00Z"))).used, 0);
});

test("the global allowance applies across different users", async () => {
  const db = new MemoryDatabase();
  const config = { ...settings, globalDailyLimit: 3 };
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => reserveUsage(db, `user-${index}`, config, String(index), now)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  assert.ok(results.filter((result) => result.status === "rejected").every((result) => result.reason.code === "global_limit"));
});

test("token settlement is idempotent and corrupted counters fail closed", async () => {
  const db = new MemoryDatabase();
  const reservation = await reserveUsage(db, "alice", settings, "request", now);
  const before = db.writes;
  await recordTokens(db, reservation, { inputTokens: 10, outputTokens: 20, totalTokens: 30, cachedTokens: 0 });
  await recordTokens(db, reservation, { inputTokens: 10, outputTokens: 20, totalTokens: 30, cachedTokens: 0 });
  assert.equal(db.writes, before + 2);
  assert.equal(db.data.get("requests/request").tokenRecorded, true);
  assert.ok(db.data.get("requests/request").expiresAt instanceof Date);
  db.data.set("dailyUsage/2026-11-15/users/alice", { used: "corrupt" });
  await assert.rejects(getUsage(db, "alice", settings, now), { code: "usage_unavailable" });
});
