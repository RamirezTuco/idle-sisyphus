import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { AppError } from "./errors.js";

export function getFirebaseServices(settings) {
  const name = `chat-csv-${settings.projectId}`;
  const app = getApps().find((candidate) => candidate.name === name)
    || initializeApp({ projectId: settings.projectId, credential: applicationDefault() }, name);
  return { auth: getAuth(app), db: getFirestore(app, settings.databaseId) };
}

export async function authenticate(request, settings, auth) {
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) {
    throw new AppError(401, "sign_in_required", "Sign in with Google before using Chat CSV.");
  }
  let identity;
  try {
    identity = await auth.verifyIdToken(token, true);
  } catch (error) {
    if (["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error",
      "auth/invalid-id-token", "auth/user-not-found", "auth/user-disabled"].includes(error.code)) {
      throw new AppError(401, "invalid_session", "Your sign-in has expired or is invalid. Please sign in again.");
    }
    throw new AppError(503, "authentication_unavailable", "Sign-in verification is unavailable. Please try again later.");
  }
  if (identity.firebase?.sign_in_provider !== "google.com") {
    throw new AppError(403, "google_sign_in_required", "Use a Google account to sign in.");
  }
  if (typeof identity.uid !== "string" || !identity.uid || identity.uid.includes("/")) {
    throw new AppError(401, "invalid_session", "The verified account identifier is invalid.");
  }
  if (settings.accessMode === "allowlist" && !settings.allowedUids.has(identity.uid)) {
    throw new AppError(403, "preview_access", "This preview is not enabled for your account.");
  }
  return identity;
}
