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

export type DomCaptionObserverOptions = {
  maxWaitMs?: number;
  signal?: AbortSignal;
  onDetach?: () => void;
};

export class DomCaptionObserver {
  readonly root: Element;
  private lastText = '';
  private destroyed = false;
  private readonly observer: MutationObserver;
  private readonly onCaptionChange: (text: string) => void;
  private readonly options?: DomCaptionObserverOptions;

  private constructor(
    root: Element,
    onCaptionChange: (text: string) => void,
    options?: DomCaptionObserverOptions,
  ) {
    this.root = root;
    this.onCaptionChange = onCaptionChange;
    this.options = options;

    this.observer = new MutationObserver(() => this.handleMutations());
    this.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.handleMutations();
  }

  static async start(
    onCaptionChange: (text: string) => void,
    options?: DomCaptionObserverOptions,
  ): Promise<DomCaptionObserver> {
    const root = await findElement(CaptionSelector.ROOT, {
      maxWaitMs: options?.maxWaitMs,
      signal: options?.signal,
    });

    if (!root) {
      throw new Error('Caption root not found');
    }

    return new DomCaptionObserver(root, onCaptionChange, options);
  }

  stop(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.observer.disconnect();
    this.lastText = '';
  }

  private handleMutations(): void {
    if (this.destroyed) {
      return;
    }

    if (!this.root.isConnected) {
      this.options?.onDetach?.();
      this.stop();
      return;
    }

    const text = readCurrentCaption(findCaptionSegments(this.root));
    const newPart = getNewCaptionPart(this.lastText, text);
    if (newPart) {
      this.lastText = text;
      this.onCaptionChange(newPart);
    }
  }
}
