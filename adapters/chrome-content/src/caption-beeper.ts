import {
  MessageType,
  PlayerIndicator,
  type Messaging,
  type TranscriptSession,
  type TranscriptSource,
} from '@beeper/core';
import {
  findElement,
  getVideoIdFromUrl,
  isWatchPage,
  PlayerSelector,
  signalPlayer,
  YoutubeEvent,
} from '@beeper/youtube';

const LOG_PREFIX = '[Caption Beeper]';
const REBIND_DEBOUNCE_MS = 150;
const PLAYER_WAIT_MS = 5_000;

export function startCaptionBeeper(messaging: Messaging, source: TranscriptSource): void {
  console.info(`${LOG_PREFIX} injected at`, location.href);

  let session: TranscriptSession | null = null;
  let indicator: PlayerIndicator | null = null;
  let abortController: AbortController | null = null;
  let rebindTimer: ReturnType<typeof setTimeout> | undefined;
  let boundVideoId: string | null = null;

  function unbind() {
    session?.stop();
    session = null;
    indicator?.unmount();
    indicator = null;
    abortController?.abort();
    abortController = null;
    boundVideoId = null;
  }

  async function bind() {
    unbind();

    if (!isWatchPage()) {
      return;
    }

    const videoId = getVideoIdFromUrl();
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
              type: MessageType.CHUNK_CAPTURED,
              text: chunk.text,
            });

            if (response.ok && response.censored) {
              signalPlayer();
            }
          })();
        },
        signal,
        onDetach: () => scheduleRebind('onDetach'),
      });

      if (signal.aborted) {
        unbind();
        return;
      }

      indicator.setState('working');
      boundVideoId = videoId;
    } catch (error) {
      if (signal.aborted) {
        return;
      }

      console.error(`${LOG_PREFIX} bind failed`, error);
      session = null;
      indicator.setState('error');
    }
  }

  function scheduleRebind(reason: string) {
    const videoId = getVideoIdFromUrl();
    // Same watch page: YouTube often fires yt-navigate-finish after initial bind.
    // Skip full teardown/rebind so the indicator does not flash loading again.
    if (reason === YoutubeEvent.NAVIGATE_FINISH && videoId && videoId === boundVideoId) {
      return;
    }

    clearTimeout(rebindTimer);
    rebindTimer = setTimeout(() => {
      void bind();
    }, REBIND_DEBOUNCE_MS);
  }

  document.addEventListener(YoutubeEvent.NAVIGATE_FINISH, () =>
    scheduleRebind(YoutubeEvent.NAVIGATE_FINISH),
  );
  void bind();
}
