import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

function configuration() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  };
}

export function getFirebaseConfigurationError() {
  const config = configuration();
  const required = {
    apiKey: "NEXT_PUBLIC_FIREBASE_API_KEY",
    authDomain: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    projectId: "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    appId: "NEXT_PUBLIC_FIREBASE_APP_ID",
  };
  const missing = Object.entries(required)
    .filter(([key]) => !config[key]?.trim())
    .map(([, name]) => name);
  return missing.length
    ? `Google sign-in setup required: configure ${missing.join(", ")} and enable Google authentication in Firebase.`
    : null;
}

export function getFirebaseAuth() {
  if (typeof window === "undefined") {
    throw new Error("Firebase authentication is available only in the browser.");
  }
  const error = getFirebaseConfigurationError();
  if (error) throw new Error(error);
  const config = Object.fromEntries(
    Object.entries(configuration()).filter(([, value]) => value),
  );
  return getAuth(getApps().some((app) => app.name === "[DEFAULT]") ? getApp() : initializeApp(config));
}
