import {
  createCensorRanges,
  MessageType,
  type CensorExecutor,
  type CensorLexicon,
  type CensorSettings,
  type Messaging,
  type TranscriptChunk,
  type TranscriptSession,
  type TranscriptSource,
} from '@beeper/core';
import { findElement, isWatchPage, PlayerSelector, signalPlayer } from '@beeper/youtube';

const LOG_PREFIX = '[Caption Beeper]';
const REBIND_DEBOUNCE_MS = 150;
const PLAYER_WAIT_MS = 5_000;

export type CensorSessionStatus = 'loading' | 'working' | 'error';

export type TimedCensorSessionOptions = {
  source: TranscriptSource;
  lexicon: CensorLexicon;
  executor: CensorExecutor;
  armOnInteraction?: boolean;
  updateSettings?(settings: CensorSettings): void;
  onTranscript?(entry: { chunk: TranscriptChunk; censored: boolean }): void;
  onStatus?: (status: CensorSessionStatus) => void;
};

export type TranscriptBeeperSession = {
  updateSettings(settings: CensorSettings): void;
  stop(): void;
};

export function startCaptionBeeper(
  messaging: Messaging,
  source: TranscriptSource,
): TranscriptBeeperSession;
export function startCaptionBeeper(
  messaging: Messaging,
  options: TimedCensorSessionOptions,
): TranscriptBeeperSession;
export function startCaptionBeeper(
  messaging: Messaging,
  sourceOrOptions: TranscriptSource | TimedCensorSessionOptions,
): TranscriptBeeperSession {
  return new CaptionBeeperSession(messaging, sourceOrOptions);
}

class CaptionBeeperSession implements TranscriptBeeperSession {
  private readonly options: TimedCensorSessionOptions | undefined;
  private readonly source: TranscriptSource;
  private session: TranscriptSession | null = null;
  private abortController: AbortController | null = null;
  private rebindTimer: ReturnType<typeof setTimeout> | undefined;
  private interactionHandler: (() => void) | undefined;
  private disposeExecutorError: (() => void) | undefined;

  constructor(
    private readonly messaging: Messaging,
    sourceOrOptions: TranscriptSource | TimedCensorSessionOptions,
  ) {
    console.info(`${LOG_PREFIX} injected at`, location.href);
    if (isTimedCensorSessionOptions(sourceOrOptions)) {
      this.options = sourceOrOptions;
      this.source = sourceOrOptions.source;
    } else {
      this.options = undefined;
      this.source = sourceOrOptions;
    }
    document.addEventListener('yt-navigate-finish', this.scheduleRebind);
    void this.bind();
  }

  updateSettings(settings: CensorSettings): void {
    this.options?.updateSettings?.(settings);
  }

  stop(): void {
    clearTimeout(this.rebindTimer);
    document.removeEventListener('yt-navigate-finish', this.scheduleRebind);
    this.unbind();
  }

  private setStatus(status: CensorSessionStatus): void {
    this.options?.onStatus?.(status);
  }

  private unbind(): void {
    this.session?.stop();
    this.session = null;
    this.options?.executor.stop?.();
    this.abortController?.abort();
    this.abortController = null;
    if (this.interactionHandler) {
      document.removeEventListener('pointerdown', this.interactionHandler, true);
      document.removeEventListener('keydown', this.interactionHandler, true);
      this.interactionHandler = undefined;
    }
    this.disposeExecutorError?.();
    this.disposeExecutorError = undefined;
  }

  private async bind(): Promise<void> {
    this.unbind();

    if (!isWatchPage()) {
      return;
    }

    const controller = new AbortController();
    this.abortController = controller;
    const { signal } = controller;

    const player = await findElement(PlayerSelector.CONTAINER, {
      maxWaitMs: PLAYER_WAIT_MS,
      signal,
    });

    if (!player || signal.aborted || this.abortController !== controller) {
      if (this.abortController === controller) {
        this.unbind();
      }
      return;
    }

    this.setStatus('loading');

    try {
      const boundSession = await this.source.bind({
        onChunk: (chunk) => {
          if (!signal.aborted && this.abortController === controller) {
            void this.handleChunk(chunk, controller);
          }
        },
        signal,
        onDetach: this.scheduleRebind,
        onError: (error) => this.failSession(error, controller),
      });

      if (signal.aborted || this.abortController !== controller) {
        boundSession.stop();
        return;
      }

      this.session = boundSession;
      const armableExecutor = this.options?.armOnInteraction
        ? getArmableExecutor(this.options.executor)
        : undefined;
      const failureAwareExecutor = getFailureAwareExecutor(this.options?.executor);
      if (failureAwareExecutor) {
        this.disposeExecutorError = failureAwareExecutor.onError((error) =>
          this.failSession(error, controller),
        );
      }
      if (armableExecutor) {
        const armPlayback = () => {
          if (this.interactionHandler) {
            document.removeEventListener('pointerdown', this.interactionHandler, true);
            document.removeEventListener('keydown', this.interactionHandler, true);
            this.interactionHandler = undefined;
          }
          void Promise.resolve(armableExecutor.arm()).then(
            () => this.setStatus('working'),
            (error: unknown) => this.failSession(error, controller),
          );
        };
        if (navigator.userActivation?.hasBeenActive) {
          armPlayback();
        } else {
          this.interactionHandler = armPlayback;
          document.addEventListener('pointerdown', this.interactionHandler, true);
          document.addEventListener('keydown', this.interactionHandler, true);
        }
      } else {
        this.setStatus('working');
      }
    } catch (error) {
      if (signal.aborted || this.abortController !== controller) {
        return;
      }
      // Aborted fetches are navigation noise; a rebind follows on its own.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error(`${LOG_PREFIX} bind failed`, error);
      this.session = null;
      this.setStatus('error');
    }
  }

  private async handleChunk(chunk: TranscriptChunk, controller: AbortController): Promise<void> {
    if (this.options) {
      try {
        const ranges = createCensorRanges(chunk, this.options.lexicon);
        this.options.onTranscript?.({ chunk, censored: ranges.length > 0 });
        await Promise.all(ranges.map((range) => this.options?.executor.execute(range)));
      } catch (error) {
        if (controller.signal.aborted || this.abortController !== controller) {
          return;
        }

        console.error(`${LOG_PREFIX} censor failed`, error);
        this.options.executor.stop?.();
        this.setStatus('error');
      }

      return;
    }

    const response = await this.messaging.send({
      type: MessageType.WORD_CAPTURED,
      word: chunk.text,
    });

    if (
      !controller.signal.aborted &&
      this.abortController === controller &&
      response.ok &&
      response.censored
    ) {
      signalPlayer();
    }
  }

  private failSession(error: unknown, controller: AbortController): void {
    if (controller.signal.aborted || this.abortController !== controller) return;
    console.error(`${LOG_PREFIX} censor failed`, error);
    this.options?.executor.stop?.();
    this.setStatus('error');
  }

  private readonly scheduleRebind = (): void => {
    clearTimeout(this.rebindTimer);
    this.rebindTimer = setTimeout(() => {
      void this.bind();
    }, REBIND_DEBOUNCE_MS);
  };
}

function getArmableExecutor(
  executor: CensorExecutor | undefined,
): { arm(): void | Promise<void> } | undefined {
  if (!executor || typeof (executor as { arm?: unknown }).arm !== 'function') return undefined;
  return executor as CensorExecutor & { arm(): void };
}

function getFailureAwareExecutor(
  executor: CensorExecutor | undefined,
): { onError(listener: (error: unknown) => void): () => void } | undefined {
  if (!executor || typeof (executor as { onError?: unknown }).onError !== 'function')
    return undefined;
  return executor as CensorExecutor & {
    onError(listener: (error: unknown) => void): () => void;
  };
}

function isTimedCensorSessionOptions(
  value: TranscriptSource | TimedCensorSessionOptions,
): value is TimedCensorSessionOptions {
  return !('bind' in value);
}
