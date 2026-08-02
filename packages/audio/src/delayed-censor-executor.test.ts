import { describe, expect, mock, test } from 'bun:test';

import { createDelayedCensorExecutor } from './delayed-censor-executor';

describe('createDelayedCensorExecutor', () => {
  test('waits for arm and shifts queued ranges by the configured delay', async () => {
    const execute = mock(async () => {});
    const executor = createDelayedCensorExecutor({ execute }, { delaySeconds: 1.2 });
    let settled = false;
    const result = executor.execute({ startTime: 2, endTime: 3 }).then(() => (settled = true));

    await Promise.resolve();
    expect(execute).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    executor.arm();
    await result;

    expect(execute).toHaveBeenCalledWith({ startTime: 3.2, endTime: 4.2 });
    expect(settled).toBe(true);
  });

  test('rejects ranges queued before stop', async () => {
    const executor = createDelayedCensorExecutor(
      { execute: mock(async () => {}) },
      { delaySeconds: 1 },
    );
    const result = executor.execute({ startTime: 1, endTime: 2 });
    executor.stop();

    await expect(result).rejects.toThrow('Censor executor stopped');
  });
});
