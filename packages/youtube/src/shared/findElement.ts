export type FindElementOptions = {
  interval?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
};

export function findElement(
  selector: string,
  options?: FindElementOptions,
): Promise<Element | null> {
  const interval = options?.interval ?? 300;
  const maxWaitMs = options?.maxWaitMs;
  const signal = options?.signal;

  const root = document.querySelector(selector);
  if (root) {
    return Promise.resolve(root);
  }

  if (signal?.aborted) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();

    const finish = (result: Element | null) => {
      clearInterval(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const onAbort = () => finish(null);

    const timer = setInterval(() => {
      if (signal?.aborted) {
        finish(null);
        return;
      }

      if (maxWaitMs !== undefined && Date.now() - startedAt >= maxWaitMs) {
        finish(null);
        return;
      }

      const found = document.querySelector(selector);
      if (found) {
        finish(found);
      }
    }, interval);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
