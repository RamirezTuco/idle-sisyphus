import { AppError } from "./errors.js";

function integerSetting(env, name, fallback, maximum) {
  const text = env[name] ?? String(fallback);
  const value = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(value) || value > maximum) {
    throw new AppError(503, "configuration", `${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

export function getSettings(env = process.env, { requireModel = false } = {}) {
  const projectId = env.GOOGLE_CLOUD_PROJECT || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new AppError(503, "configuration", "The server Firebase project is not configured.");
  }
  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID && env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) {
    throw new AppError(503, "configuration", "The client and server must use the same Firebase project.");
  }
  if (env.NODE_ENV === "production" && (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new AppError(503, "configuration", "Firebase emulators must not be used in production.");
  }
  const accessMode = env.CHAT_CSV_ACCESS_MODE || "allowlist";
  const allowedUids = new Set((env.CHAT_CSV_ALLOWED_UIDS || "").split(",").map((uid) => uid.trim()).filter(Boolean));
  if (!["allowlist", "authenticated"].includes(accessMode) || (accessMode === "allowlist" && allowedUids.size === 0)) {
    throw new AppError(503, "configuration", "Configure the preview's allowed Firebase UIDs or explicitly select authenticated access.");
  }
  if (env.NODE_ENV === "production" && !env.CHAT_CSV_GLOBAL_DAILY_LIMIT) {
    throw new AppError(503, "configuration", "Set an explicit global daily query limit before production deployment.");
  }
  const databaseId = env.FIRESTORE_DATABASE_ID || "chat-csv";
  if (!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(databaseId)) {
    throw new AppError(503, "configuration", "Configure a named Firestore database for Chat CSV.");
  }
  const model = env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const modelProvider = env.GEMINI_PROVIDER || "developer";
  const modelRegion = env.GEMINI_REGION || "us";
  if (!["developer", "vertex"].includes(modelProvider) ||
      (!["us", "eu", "global"].includes(modelRegion) && !/^[a-z]+-[a-z]+[0-9]+$/.test(modelRegion))) {
    throw new AppError(503, "configuration", "Configure a supported Gemini provider and region.");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new AppError(503, "configuration", "The configured Gemini model name is invalid.");
  }
  if (requireModel && modelProvider === "developer" && !env.GEMINI_API_KEY?.trim()) {
    throw new AppError(503, "configuration", "The server Gemini API key is not configured.");
  }
  return {
    projectId,
    databaseId,
    accessMode,
    allowedUids,
    dailyLimit: integerSetting(env, "CHAT_CSV_DAILY_LIMIT", 5, 1000),
    globalDailyLimit: integerSetting(env, "CHAT_CSV_GLOBAL_DAILY_LIMIT", 100, 100_000),
    retentionDays: integerSetting(env, "CHAT_CSV_USAGE_RETENTION_DAYS", 7, 30),
    model,
    modelProvider,
    modelRegion,
    modelKey: env.GEMINI_API_KEY
  };
}
