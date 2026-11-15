import { randomUUID } from "node:crypto";
import { getSettings } from "./config.js";
import { authenticate, getFirebaseServices } from "./firebase.js";
import { readUpload } from "./dataset.js";
import { buildPrompt, executeAnalysis, generateAnalysis } from "./analysis.js";
import { finishRequest, getUsage, recordTokens, reserveUsage } from "./usage.js";
import { AppError } from "./errors.js";

function signedRequest(request) {
  if (!request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)) {
    throw new AppError(401, "sign_in_required", "Sign in with Google before using Chat CSV.");
  }
}

function json(value, status, requestId) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId }
  });
}

function errorResponse(error, requestId, logger) {
  const expected = error instanceof AppError;
  if (!expected || error.status >= 500) {
    logger.error("Chat CSV request failed.", { requestId, code: expected ? error.code : "unexpected" });
  }
  const response = json({
    error: expected ? error.message : "The analysis service is unavailable. Please try again later.",
    code: expected ? error.code : "service_unavailable",
    requestId
  }, expected ? error.status : 503, requestId);
  if (expected && error.status === 429) {
    const nextDay = new Date();
    nextDay.setUTCHours(24, 0, 0, 0);
    response.headers.set("Retry-After", String(Math.ceil((nextDay.getTime() - Date.now()) / 1000)));
  }
  return response;
}

export function createHandlers({
  settingsFor = getSettings,
  servicesFor = getFirebaseServices,
  verify = authenticate,
  upload = readUpload,
  reserve = reserveUsage,
  readUsage = getUsage,
  generate = generateAnalysis,
  execute = executeAnalysis,
  record = recordTokens,
  finish = finishRequest,
  logger = console
} = {}) {
  return {
    async POST(request) {
      const requestId = randomUUID();
      let reservation;
      try {
        signedRequest(request);
        const settings = settingsFor(process.env, { requireModel: true });
        const { auth, db } = servicesFor(settings);
        const user = await verify(request, settings, auth);
        const { dataset, question } = await upload(request);
        buildPrompt(dataset, question);
        if (request.signal.aborted) throw new AppError(408, "request_cancelled", "The request was cancelled.");
        reservation = await reserve(db, user.uid, settings, requestId);
        const { code, tokenUsage } = await generate(settings, dataset, question, request.signal);
        await record(db, reservation, tokenUsage);
        const analysis = await execute(code, dataset.data);
        await finish(reservation, true);
        return json({
          ...analysis, code, tokenUsage, totalRows: dataset.data.length,
          columns: dataset.columns, worksheet: dataset.worksheet, usage: reservation.usage
        }, 200, requestId);
      } catch (error) {
        let failure = error?.name === "AbortError" || error?.name === "TimeoutError"
          ? new AppError(504, "model_timeout", "The analysis request timed out. Please try a simpler question.")
          : error;
        if (reservation) {
          try {
            await finish(reservation, false);
          } catch {
            failure = new AppError(503, "usage_unavailable", "The query outcome could not be recorded. Please try again later.");
          }
        }
        return errorResponse(failure, requestId, logger);
      }
    },
    async GET(request) {
      const requestId = randomUUID();
      try {
        signedRequest(request);
        const settings = settingsFor();
        const { auth, db } = servicesFor(settings);
        const user = await verify(request, settings, auth);
        return json({ usage: await readUsage(db, user.uid, settings) }, 200, requestId);
      } catch (error) {
        return errorResponse(error, requestId, logger);
      }
    }
  };
}
