"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth, getFirebaseConfigurationError } from "../lib/client/firebase";
import { authenticatedRequest } from "../lib/client/api";

function errorText(error) {
  return `${error.message || "Something went wrong. Please try again."}${error.requestId ? ` (Request ID: ${error.requestId})` : ""}`;
}

function validUsage(usage) {
  return usage && ["used", "limit", "remaining"].every((key) =>
    Number.isFinite(usage[key]) && usage[key] >= 0,
  ) && typeof usage.date === "string";
}

export default function useChatSession() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [setupError, setSetupError] = useState(null);
  const [authError, setAuthError] = useState("");
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");
  const [answer, setAnswer] = useState(null);
  const [answerFileName, setAnswerFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const activeUser = useRef(null);
  const requests = useRef(new Set());
  const asking = useRef(false);
  const usageVersion = useRef(0);

  const abortRequests = useCallback(() => {
    requests.current.forEach((controller) => controller.abort());
    requests.current.clear();
  }, []);

  const loadUsage = useCallback(async (identity, epoch) => {
    if (!identity || epoch !== generation.current) return;
    const version = ++usageVersion.current;
    const controller = new AbortController();
    requests.current.add(controller);
    setUsageLoading(true);
    setUsageError("");
    try {
      const data = await authenticatedRequest(identity, "/api/usage", { signal: controller.signal, timeout: 20000 });
      if (!validUsage(data.usage)) throw new Error("The server returned invalid usage information.");
      if (epoch === generation.current && version === usageVersion.current) setUsage(data.usage);
    } catch (failure) {
      if (epoch === generation.current && version === usageVersion.current && failure.name !== "AbortError") {
        setUsage(null);
        setUsageError(errorText(failure));
      }
    } finally {
      requests.current.delete(controller);
      if (epoch === generation.current && version === usageVersion.current) setUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    const configError = getFirebaseConfigurationError();
    if (configError) {
      setSetupError(configError);
      setAuthReady(true);
      return;
    }
    let unsubscribe;
    try {
      unsubscribe = onAuthStateChanged(getFirebaseAuth(), (identity) => {
        const epoch = ++generation.current;
        abortRequests();
        activeUser.current = identity;
        asking.current = false;
        setUser(identity);
        setAuthReady(true);
        setAuthError("");
        setUsage(null);
        setUsageLoading(false);
        setUsageError("");
        setAnswer(null);
        setAnswerFileName("");
        setError("");
        setLoading(false);
        if (identity) void loadUsage(identity, epoch);
      }, (failure) => {
        ++generation.current;
        abortRequests();
        activeUser.current = null;
        asking.current = false;
        setUser(null);
        setUsage(null);
        setAnswer(null);
        setLoading(false);
        setUsageLoading(false);
        setAuthError(errorText(failure));
        setAuthReady(true);
      });
    } catch (failure) {
      setAuthError(errorText(failure));
      setAuthReady(true);
    }
    return () => {
      ++generation.current;
      abortRequests();
      unsubscribe?.();
    };
  }, [abortRequests, loadUsage]);

  async function login() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
    } catch (failure) {
      setAuthError(errorText(failure));
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    setAuthBusy(true);
    setAuthError("");
    try {
      await signOut(getFirebaseAuth());
    } catch (failure) {
      setAuthError(errorText(failure));
    } finally {
      setAuthBusy(false);
    }
  }

  async function ask(file, question) {
    const identity = activeUser.current;
    const epoch = generation.current;
    if (!identity) {
      setError("Sign in with Google before asking an AI question.");
      return;
    }
    if (asking.current) return;
    asking.current = true;
    const controller = new AbortController();
    requests.current.add(controller);
    ++usageVersion.current;
    setUsageLoading(false);
    setLoading(true);
    setError("");
    setAnswer(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("question", question.trim());
      const data = await authenticatedRequest(identity, "/api/ask_csv", { method: "POST", body, signal: controller.signal });
      if (!data.queryResult || !Object.hasOwn(data.queryResult, "result")) {
        throw new Error("The server response did not contain a result.");
      }
      if (epoch !== generation.current) return;
      setAnswer(data);
      setAnswerFileName(file.name);
      if (validUsage(data.usage)) {
        setUsage(data.usage);
        setUsageError("");
      } else {
        await loadUsage(identity, epoch);
      }
    } catch (failure) {
      if (epoch === generation.current && failure.name !== "AbortError") {
        setError(errorText(failure));
        // The server can consume usage even when the AI provider fails.
        await loadUsage(identity, epoch);
      }
    } finally {
      requests.current.delete(controller);
      if (epoch === generation.current) {
        asking.current = false;
        setLoading(false);
      }
    }
  }

  return {
    user, authReady, authBusy, setupError, authError, usage, usageLoading,
    usageError, answer, answerFileName, loading, error, login, logout, ask,
    refreshUsage: () => loadUsage(activeUser.current, generation.current),
  };
}
