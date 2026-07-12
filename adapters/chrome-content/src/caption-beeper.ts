import { MessageType, type Messaging } from '@beeper/core';
import {
  createCaptionSession,
  findElement,
  isWatchPage,
  mountPlayerIndicator,
  PlayerSelector,
  signalPlayer,
  type CaptionSession,
} from '@beeper/youtube';

const LOG_PREFIX = '[Caption Observer]';
const REBIND_DEBOUNCE_MS = 150;
const CAPTION_WAIT_MS = 10_000;
const PLAYER_WAIT_MS = 5_000;

export function startCaptionBeeper(messaging: Messaging): void {
  console.info(`${LOG_PREFIX} injected at`, location.href);

  let session: CaptionSession | null = null;
  let indicator: { unmount: () => void } | null = null;
  let abortController: AbortController | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;

  function unbind() {
    session?.destroy();
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

    session = await createCaptionSession(
      (text) => {
        void (async () => {
          const response = await messaging.send({
            type: MessageType.WORD_CAPTURED,
            word: text,
          });

          if (response.ok && response.censored) {
            signalPlayer();
          }
        })();
      },
      {
        maxWaitMs: CAPTION_WAIT_MS,
        signal,
        onDetach: scheduleRebind,
      },
    );

    if (!session || signal.aborted) {
      unbind();
      return;
    }

    const player = await findElement(PlayerSelector.CONTAINER, {
      maxWaitMs: PLAYER_WAIT_MS,
      signal,
    });

    if (!player || signal.aborted) {
      unbind();
      return;
    }

    indicator = mountPlayerIndicator(player);
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
