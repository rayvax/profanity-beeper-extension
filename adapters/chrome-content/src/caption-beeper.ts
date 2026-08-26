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
  console.info(`${LOG_PREFIX} injected at`, location.href);

  let options: TimedCensorSessionOptions | undefined;
  let source: TranscriptSource;

  if (isTimedCensorSessionOptions(sourceOrOptions)) {
    options = sourceOrOptions;
    source = options.source;
  } else {
    source = sourceOrOptions;
  }
  let session: TranscriptSession | null = null;
  let abortController: AbortController | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;
  let interactionHandler: (() => void) | undefined;
  let disposeExecutorError: (() => void) | undefined;

  function setStatus(status: CensorSessionStatus) {
    options?.onStatus?.(status);
  }

  function unbind() {
    session?.stop();
    session = null;
    options?.executor.stop?.();
    abortController?.abort();
    abortController = null;
    if (interactionHandler) {
      document.removeEventListener('pointerdown', interactionHandler, true);
      document.removeEventListener('keydown', interactionHandler, true);
      interactionHandler = undefined;
    }
    disposeExecutorError?.();
    disposeExecutorError = undefined;
  }

  async function bind() {
    unbind();

    if (!isWatchPage()) {
      return;
    }

    const controller = new AbortController();
    abortController = controller;
    const { signal } = controller;

    const player = await findElement(PlayerSelector.CONTAINER, {
      maxWaitMs: PLAYER_WAIT_MS,
      signal,
    });

    if (!player || signal.aborted || abortController !== controller) {
      if (abortController === controller) {
        unbind();
      }
      return;
    }

    setStatus('loading');

    try {
      const boundSession = await source.bind({
        onChunk: (chunk) => {
          if (!signal.aborted && abortController === controller) {
            void handleChunk(chunk, controller);
          }
        },
        signal,
        onDetach: scheduleRebind,
        onError: (error) => failSession(error, controller),
      });

      if (signal.aborted || abortController !== controller) {
        boundSession.stop();
        return;
      }

      session = boundSession;
      const armableExecutor = options?.armOnInteraction
        ? getArmableExecutor(options.executor)
        : undefined;
      const failureAwareExecutor = getFailureAwareExecutor(options?.executor);
      if (failureAwareExecutor) {
        disposeExecutorError = failureAwareExecutor.onError((error) =>
          failSession(error, controller),
        );
      }
      if (armableExecutor) {
        const armPlayback = () => {
          if (interactionHandler) {
            document.removeEventListener('pointerdown', interactionHandler, true);
            document.removeEventListener('keydown', interactionHandler, true);
            interactionHandler = undefined;
          }
          void Promise.resolve(armableExecutor.arm()).then(
            () => setStatus('working'),
            (error: unknown) => failSession(error, controller),
          );
        };
        if (navigator.userActivation?.hasBeenActive) {
          armPlayback();
        } else {
          interactionHandler = armPlayback;
          document.addEventListener('pointerdown', interactionHandler, true);
          document.addEventListener('keydown', interactionHandler, true);
        }
      } else {
        setStatus('working');
      }
    } catch (error) {
      if (signal.aborted || abortController !== controller) {
        return;
      }
      // Aborted fetches are navigation noise; a rebind follows on its own.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      console.error(`${LOG_PREFIX} bind failed`, error);
      session = null;
      setStatus('error');
    }
  }

  async function handleChunk(chunk: TranscriptChunk, controller: AbortController) {
    if (options) {
      try {
        const ranges = createCensorRanges(chunk, options.lexicon);
        options.onTranscript?.({ chunk, censored: ranges.length > 0 });
        await Promise.all(ranges.map((range) => options.executor.execute(range)));
      } catch (error) {
        if (controller.signal.aborted || abortController !== controller) {
          return;
        }

        console.error(`${LOG_PREFIX} censor failed`, error);
        options.executor.stop?.();
        setStatus('error');
      }

      return;
    }

    const response = await messaging.send({
      type: MessageType.WORD_CAPTURED,
      word: chunk.text,
    });

    if (
      !controller.signal.aborted &&
      abortController === controller &&
      response.ok &&
      response.censored
    ) {
      signalPlayer();
    }
  }

  function failSession(error: unknown, controller: AbortController) {
    if (controller.signal.aborted || abortController !== controller) return;
    console.error(`${LOG_PREFIX} censor failed`, error);
    options?.executor.stop?.();
    setStatus('error');
  }

  function scheduleRebind() {
    clearTimeout(rebindTimer);
    rebindTimer = setTimeout(() => {
      void bind();
    }, REBIND_DEBOUNCE_MS);
  }

  document.addEventListener('yt-navigate-finish', scheduleRebind);
  void bind();

  return {
    updateSettings(settings) {
      options?.updateSettings?.(settings);
    },
    stop() {
      clearTimeout(rebindTimer);
      document.removeEventListener('yt-navigate-finish', scheduleRebind);
      unbind();
    },
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
