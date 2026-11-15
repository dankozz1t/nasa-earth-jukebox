export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export function isAbortError(err: unknown): boolean {
  return (err instanceof Error || err instanceof DOMException) && err.name === "AbortError";
}

// Rejects as soon as `signal` aborts, whatever `p` does.
export function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
