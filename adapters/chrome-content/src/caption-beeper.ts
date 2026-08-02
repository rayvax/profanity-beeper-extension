import {
  createCensorRanges,
  MessageType,
  PlayerIndicator,
  type CensorExecutor,
  type CensorLexicon,
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

export type CensorSessionSettings = {
  enabled: boolean;
};

export type TimedCensorSessionOptions = {
  source: TranscriptSource;
  lexicon: CensorLexicon;
  executor: CensorExecutor;
  settings: CensorSessionSettings;
  onStatus?: (status: CensorSessionStatus) => void;
};

export type CaptionBeeperSession = { stop(): void };

export function startCaptionBeeper(
  messaging: Messaging,
  source: TranscriptSource,
): CaptionBeeperSession;
export function startCaptionBeeper(
  messaging: Messaging,
  options: TimedCensorSessionOptions,
): CaptionBeeperSession;
export function startCaptionBeeper(
  messaging: Messaging,
  sourceOrOptions: TranscriptSource | TimedCensorSessionOptions,
): CaptionBeeperSession {
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
  let indicator: PlayerIndicator | null = null;
  let abortController: AbortController | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;

  function setStatus(status: CensorSessionStatus) {
    indicator?.setState(status);
    options?.onStatus?.(status);
  }

  function unbind() {
    session?.stop();
    session = null;
    options?.executor.stop?.();
    indicator?.unmount();
    indicator = null;
    abortController?.abort();
    abortController = null;
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

    indicator = new PlayerIndicator();
    indicator.mount(player);
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
      });

      if (signal.aborted || abortController !== controller) {
        boundSession.stop();
        return;
      }

      session = boundSession;
      setStatus('working');
    } catch (error) {
      if (signal.aborted || abortController !== controller) {
        return;
      }

      console.error(`${LOG_PREFIX} bind failed`, error);
      session = null;
      setStatus('error');
    }
  }

  async function handleChunk(chunk: TranscriptChunk, controller: AbortController) {
    if (options) {
      if (!options.settings.enabled) {
        return;
      }

      try {
        const ranges = createCensorRanges(chunk, options.lexicon);
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

  function scheduleRebind() {
    clearTimeout(rebindTimer);
    rebindTimer = setTimeout(() => {
      void bind();
    }, REBIND_DEBOUNCE_MS);
  }

  document.addEventListener('yt-navigate-finish', scheduleRebind);
  void bind();

  return {
    stop() {
      clearTimeout(rebindTimer);
      document.removeEventListener('yt-navigate-finish', scheduleRebind);
      unbind();
    },
  };
}

function isTimedCensorSessionOptions(
  value: TranscriptSource | TimedCensorSessionOptions,
): value is TimedCensorSessionOptions {
  return !('bind' in value);
}
