import {
  MessageType,
  PlayerIndicator,
  type Messaging,
  type TranscriptSession,
  type TranscriptSource,
} from '@beeper/core';
import { findElement, isWatchPage, PlayerSelector, signalPlayer } from '@beeper/youtube';

const LOG_PREFIX = '[Caption Beeper]';
const REBIND_DEBOUNCE_MS = 150;
const PLAYER_WAIT_MS = 5_000;

export function startCaptionBeeper(messaging: Messaging, source: TranscriptSource): void {
  console.info(`${LOG_PREFIX} injected at`, location.href);

  let session: TranscriptSession | null = null;
  let indicator: PlayerIndicator | null = null;
  let abortController: AbortController | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;

  function unbind() {
    session?.stop();
    session = null;
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

    abortController = new AbortController();
    const { signal } = abortController;

    const player = await findElement(PlayerSelector.CONTAINER, {
      maxWaitMs: PLAYER_WAIT_MS,
      signal,
    });

    if (!player || signal.aborted) {
      unbind();
      return;
    }

    indicator = new PlayerIndicator();
    indicator.mount(player);
    indicator.setState('loading');

    try {
      session = await source.bind({
        onChunk: (chunk) => {
          void (async () => {
            const response = await messaging.send({
              type: MessageType.WORD_CAPTURED,
              word: chunk.text,
            });

            if (response.ok && response.censored) {
              signalPlayer();
            }
          })();
        },
        signal,
        onDetach: scheduleRebind,
      });

      if (signal.aborted) {
        unbind();
        return;
      }

      indicator.setState('working');
    } catch (error) {
      console.error(`${LOG_PREFIX} bind failed`, error);
      session = null;
      indicator.setState('error');
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
}
