import { FieldValue } from "firebase-admin/firestore";
import { AppError } from "./errors.js";

export function usageFor(used, limit, date) {
  if (!Number.isSafeInteger(used) || used < 0) {
    throw new AppError(503, "usage_unavailable", "Usage records could not be read safely.");
  }
  return { used, limit, remaining: Math.max(0, limit - used), date };
}

function refsFor(db, uid, date) {
  const global = db.collection("dailyUsage").doc(date);
  return { global, user: global.collection("users").doc(uid) };
}

function usedFrom(snapshot) {
  return snapshot.exists ? snapshot.data().used : 0;
}

export async function getUsage(db, uid, settings, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const { user } = refsFor(db, uid, date);
  return usageFor(usedFrom(await user.get()), settings.dailyLimit, date);
}

export async function reserveUsage(db, uid, settings, requestId, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const refs = refsFor(db, uid, date);
  const request = db.collection("requests").doc(requestId);
  const expiresAt = new Date(now.getTime() + settings.retentionDays * 86_400_000);
  const usage = await db.runTransaction(async (transaction) => {
    const [userSnapshot, globalSnapshot] = await Promise.all([
      transaction.get(refs.user), transaction.get(refs.global)
    ]);
    const userUsage = usageFor(usedFrom(userSnapshot), settings.dailyLimit, date);
    const globalUsage = usageFor(usedFrom(globalSnapshot), settings.globalDailyLimit, date);
    if (!userUsage.remaining) throw new AppError(429, "daily_limit", "You have used today's question allowance. It resets at midnight UTC.");
    if (!globalUsage.remaining) throw new AppError(429, "global_limit", "The service has reached today's analysis budget. Please try again tomorrow.");
    transaction.set(refs.user, { used: userUsage.used + 1, expiresAt }, { merge: true });
    transaction.set(refs.global, { used: globalUsage.used + 1, expiresAt }, { merge: true });
    transaction.create(request, { uid, date, status: "reserved", tokenRecorded: false, createdAt: now, expiresAt });
    return usageFor(userUsage.used + 1, settings.dailyLimit, date);
  });
  return { usage, request, ...refs };
}

export async function recordTokens(db, reservation, tokens) {
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reservation.request);
    if (!snapshot.exists) throw new AppError(503, "usage_unavailable", "The query reservation is missing.");
    if (snapshot.data().tokenRecorded) return;
    const updates = Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name, FieldValue.increment(value)]));
    transaction.set(reservation.user, updates, { merge: true });
    transaction.set(reservation.global, updates, { merge: true });
    transaction.update(reservation.request, { tokenRecorded: true, status: "model_returned" });
  });
}

export async function finishRequest(reservation, succeeded) {
  await reservation.request.update({ status: succeeded ? "succeeded" : "failed", completedAt: new Date() });
}
