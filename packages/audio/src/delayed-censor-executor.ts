export type DelayedCensorRange = {
  startTime: number;
  endTime: number;
};

type CensorExecutor = {
  execute(range: DelayedCensorRange): void | Promise<void>;
  stop?(): void;
};

export type DelayedCensorExecutor = CensorExecutor & {
  arm(): void;
  disarm(): void;
};

export type DelayedCensorOptions = {
  delaySeconds: number;
};

type PendingExecution = {
  range: DelayedCensorRange;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

/**
 * Holds ML censor ranges until page interaction arms playback, then shifts
 * them onto the delayed media timeline before delegating to the shared effect.
 */
export function createDelayedCensorExecutor(
  executor: CensorExecutor,
  options: DelayedCensorOptions,
): DelayedCensorExecutor {
  let armed = false;
  let stopped = false;
  const pending: PendingExecution[] = [];

  const flush = () => {
    if (!armed || stopped) return;
    const queued = pending.splice(0);
    queued.forEach(({ range, resolve, reject }) => {
      try {
        void Promise.resolve(executor.execute(shiftRange(range, options.delaySeconds))).then(
          resolve,
          reject,
        );
      } catch (error) {
        reject(error);
      }
    });
  };

  return {
    execute(range) {
      if (stopped) return Promise.reject(new Error('Censor executor stopped'));
      if (!armed) {
        return new Promise<void>((resolve, reject) => {
          pending.push({ range, resolve, reject });
        });
      }
      return executor.execute(shiftRange(range, options.delaySeconds));
    },
    arm() {
      armed = true;
      flush();
    },
    disarm() {
      armed = false;
    },
    stop() {
      pending.splice(0).forEach(({ reject }) => reject(new Error('Censor executor stopped')));
      stopped = false;
      armed = false;
      executor.stop?.();
    },
  };
}

function shiftRange(range: DelayedCensorRange, delaySeconds: number): DelayedCensorRange {
  return {
    startTime: range.startTime + delaySeconds,
    endTime: range.endTime + delaySeconds,
  };
}
