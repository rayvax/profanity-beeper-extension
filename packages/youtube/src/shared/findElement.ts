export function findElement(selector: string, timeout = 300): Promise<Element> {
  const root = document.querySelector(selector);
  if (root) {
    return Promise.resolve(root);
  }

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const found = document.querySelector(selector);
      if (found) {
        clearInterval(interval);
        resolve(found);
      }
    }, timeout);
  });
}
