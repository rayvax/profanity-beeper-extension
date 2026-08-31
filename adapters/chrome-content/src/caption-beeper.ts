import {
  CensorStatus,
  createCensorRanges,
  type CensorExecutor,
  type CensorSettings,
  type CensorStatusValue,
  type ChunkMatcher,
  type TranscriptChunk,
  type TranscriptSession,
  type TranscriptSource,
} from '@beeper/core';
import {
  findElement,
  getVideoIdFromUrl,
  isWatchPage,
  PlayerSelector,
  YoutubeEvent,
} from '@beeper/youtube';

const LOG_PREFIX = '[Caption Beeper]';
const REBIND_DEBOUNCE_MS = 150;
const PLAYER_WAIT_MS = 5_000;

export type TimedCensorSessionOptions = {
  source: TranscriptSource;
  matcher: ChunkMatcher;
  executor: CensorExecutor;
  armOnInteraction?: boolean;
  updateSettings?(settings: CensorSettings): void;
  onTranscript?(entry: { chunk: TranscriptChunk; censored: boolean }): void;
  onStatus?: (status: CensorStatusValue) => void;
};

export type TranscriptBeeperSession = {
  updateSettings(settings: CensorSettings): void;
  stop(): void;
};

export function startCaptionBeeper(options: TimedCensorSessionOptions): TranscriptBeeperSession {
  return new CaptionBeeperSession(options);
}

class CaptionBeeperSession implements TranscriptBeeperSession {
  private session: TranscriptSession | null = null;
  private abortController: AbortController | null = null;
  private rebindTimer: ReturnType<typeof setTimeout> | undefined;
  private interactionHandler: (() => void) | undefined;
  private disposeExecutorError: (() => void) | undefined;
  private boundVideoId: string | null = null;

  constructor(private readonly options: TimedCensorSessionOptions) {
    console.info(`${LOG_PREFIX} injected at`, location.href);
    document.addEventListener(YoutubeEvent.NAVIGATE_FINISH, this.onNavigateFinish);
    void this.bind();
  }

  updateSettings(settings: CensorSettings): void {
    this.options.updateSettings?.(settings);
  }

  stop(): void {
    clearTimeout(this.rebindTimer);
    document.removeEventListener(YoutubeEvent.NAVIGATE_FINISH, this.onNavigateFinish);
    this.unbind();
  }

  private setStatus(status: CensorStatusValue): void {
    this.options.onStatus?.(status);
  }

  private unbind(): void {
    this.session?.stop();
    this.session = null;
    this.options.executor.stop?.();
    this.abortController?.abort();
    this.abortController = null;
    this.boundVideoId = null;
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

    const videoId = getVideoIdFromUrl();
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

    this.setStatus(CensorStatus.WAITING);

    try {
      const boundSession = await this.options.source.bind({
        onChunk: (chunk) => {
          if (!signal.aborted && this.abortController === controller) {
            void this.handleChunk(chunk, controller);
          }
        },
        signal,
        onDetach: () => this.scheduleRebind('onDetach'),
        onError: (error) => this.failSession(error, controller),
      });

      if (signal.aborted || this.abortController !== controller) {
        boundSession.stop();
        return;
      }

      this.session = boundSession;
      const armableExecutor = this.options.armOnInteraction
        ? getArmableExecutor(this.options.executor)
        : undefined;
      const failureAwareExecutor = getFailureAwareExecutor(this.options.executor);
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
            () => this.setStatus(CensorStatus.WORKING),
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
        this.setStatus(CensorStatus.WORKING);
      }
      this.boundVideoId = videoId;
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
      this.setStatus(CensorStatus.ERROR);
    }
  }

  private async handleChunk(chunk: TranscriptChunk, controller: AbortController): Promise<void> {
    try {
      const ranges = createCensorRanges(chunk, this.options.matcher);
      this.options.onTranscript?.({ chunk, censored: ranges.length > 0 });
      await Promise.all(ranges.map((range) => this.options.executor.execute(range)));
    } catch (error) {
      if (controller.signal.aborted || this.abortController !== controller) {
        return;
      }

      console.error(`${LOG_PREFIX} censor failed`, error);
      this.options.executor.stop?.();
      this.setStatus(CensorStatus.ERROR);
    }
  }

  private failSession(error: unknown, controller: AbortController): void {
    if (controller.signal.aborted || this.abortController !== controller) return;
    console.error(`${LOG_PREFIX} censor failed`, error);
    this.options.executor.stop?.();
    this.setStatus(CensorStatus.ERROR);
  }

  private scheduleRebind(reason: string): void {
    const videoId = getVideoIdFromUrl();
    // Same watch page: YouTube often fires yt-navigate-finish after initial bind.
    // Skip full teardown/rebind so the session status does not flash again.
    if (reason === YoutubeEvent.NAVIGATE_FINISH && videoId && videoId === this.boundVideoId) {
      return;
    }

    clearTimeout(this.rebindTimer);
    this.rebindTimer = setTimeout(() => {
      void this.bind();
    }, REBIND_DEBOUNCE_MS);
  }

  private readonly onNavigateFinish = (): void => {
    this.scheduleRebind(YoutubeEvent.NAVIGATE_FINISH);
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
