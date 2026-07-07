import { CaptionSelector } from './selectors';

function findElement(selector: string, timeout = 300): Promise<Element> {
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

function findCaptionSegments(root: Element | null): Element[] {
  if (!root) {
    return [];
  }
  return Array.from(root.querySelectorAll(CaptionSelector.SEGMENT));
}

function readCurrentCaption(segments: Element[]): string {
  return segments
    .filter((el) => el.isConnected)
    .map((el) => el.textContent)
    .join(' ')
    .trim();
}

function getNewCaptionPart(previous: string, current: string): string {
  if (!previous) {
    return current;
  }
  if (!current) {
    return '';
  }
  if (current.startsWith(previous)) {
    return current.slice(previous.length).trim();
  }

  const maxLen = Math.min(previous.length, current.length);
  for (let len = maxLen; len > 0; len--) {
    const suffix = previous.slice(-len);
    const idx = current.indexOf(suffix);
    if (idx !== -1) {
      return current.slice(idx + len).trim();
    }
  }

  return current;
}

export async function observeCaptions(
  onCaptionChange: (text: string) => void,
): Promise<void> {
  let lastText = '';

  const root = await findElement(CaptionSelector.ROOT);

  function handleMutations() {
    const text = readCurrentCaption(findCaptionSegments(root));
    const newPart = getNewCaptionPart(lastText, text);
    if (newPart) {
      lastText = text;
      onCaptionChange(newPart);
    }
  }

  const observer = new MutationObserver(handleMutations);
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  handleMutations();
}
