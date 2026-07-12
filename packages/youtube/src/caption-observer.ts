import { CaptionSelector } from './selectors';
import { findElement } from './shared';

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

export type CaptionSession = {
  destroy: () => void;
  root: Element;
};

export type CreateCaptionSessionOptions = {
  maxWaitMs?: number;
  signal?: AbortSignal;
  onDetach?: () => void;
};

export async function createCaptionSession(
  onCaptionChange: (text: string) => void,
  options?: CreateCaptionSessionOptions,
): Promise<CaptionSession | null> {
  const root = await findElement(CaptionSelector.ROOT, {
    maxWaitMs: options?.maxWaitMs,
    signal: options?.signal,
  });

  if (!root) {
    return null;
  }

  const captionRoot = root;
  let lastText = '';
  let destroyed = false;

  function handleMutations() {
    if (destroyed) {
      return;
    }

    if (!captionRoot.isConnected) {
      options?.onDetach?.();
      destroy();
      return;
    }

    const text = readCurrentCaption(findCaptionSegments(captionRoot));
    const newPart = getNewCaptionPart(lastText, text);
    if (newPart) {
      lastText = text;
      onCaptionChange(newPart);
    }
  }

  const observer = new MutationObserver(handleMutations);
  observer.observe(captionRoot, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  handleMutations();

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    observer.disconnect();
    lastText = '';
  }

  return { destroy, root: captionRoot };
}
