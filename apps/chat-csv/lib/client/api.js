export async function authenticatedRequest(user, path, { signal, timeout = 90000, ...options } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  let cancelToken;
  try {
    const token = await Promise.race([
      user.getIdToken(),
      new Promise((_, reject) => {
        cancelToken = () => reject(new DOMException("Request cancelled", "AbortError"));
        controller.signal.addEventListener("abort", cancelToken, { once: true });
        if (controller.signal.aborted) cancelToken();
      }),
    ]);
    if (controller.signal.aborted) throw new DOMException("Request cancelled", "AbortError");
    const response = await fetch(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error) {
      const error = new Error(data?.error || `Request failed (${response.status}). Please try again.`);
      error.requestId = data?.requestId;
      throw error;
    }
    if (!data) throw new Error("The server returned an unreadable response. Please try again.");
    return data;
  } catch (error) {
    if (timedOut) throw new Error("The request timed out. Please try again; an attempted query may still count toward today's limit.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (cancelToken) controller.signal.removeEventListener("abort", cancelToken);
  }
}
