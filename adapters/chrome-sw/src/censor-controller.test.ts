import { describe, expect, mock, test } from 'bun:test';
import {
  CensorStatus,
  MessageType,
  createDefaultCensorSettings,
  type Messaging,
} from '@beeper/core';

import { registerCensorController } from './censor-controller';

function createMessagingHarness() {
  const handlers = new Map<string, Parameters<Messaging['on']>[1]>();
  const messaging: Messaging = {
    send: mock(async () => undefined) as Messaging['send'],
    on: ((type, handler) => {
      handlers.set(type, handler);
      return () => {};
    }) as Messaging['on'],
  };

  return { handlers, messaging };
}

describe('registerCensorController', () => {
  test('rejects invalid RegExp without persisting or broadcasting it', async () => {
    const { handlers, messaging } = createMessagingHarness();
    const save = mock(async () => {});
    const broadcast = mock(async () => {});
    registerCensorController(messaging, {
      load: async () => createDefaultCensorSettings(),
      save,
      broadcast,
      setActionStatus: async () => {},
    });

    const reply = mock(() => {});
    const handler = handlers.get(MessageType.UPDATE_CENSOR_SETTINGS)!;
    handler(
      {
        type: MessageType.UPDATE_CENSOR_SETTINGS,
        settings: { ...createDefaultCensorSettings(), patterns: ['['] },
      },
      reply,
      {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reply).toHaveBeenCalledWith({ ok: false, error: 'Invalid RegExp: [' });
    expect(save).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  test('records a tab Censor status and exposes it to the popup', async () => {
    const { handlers, messaging } = createMessagingHarness();
    const setActionStatus = mock(async () => {});
    registerCensorController(messaging, {
      load: async () => createDefaultCensorSettings(),
      save: async () => {},
      broadcast: async () => {},
      setActionStatus,
    });

    handlers.get(MessageType.CENSOR_STATUS_UPDATED)!(
      { type: MessageType.CENSOR_STATUS_UPDATED, status: CensorStatus.WORKING },
      undefined as never,
      { tabId: 9 },
    );
    const reply = mock(() => {});
    handlers.get(MessageType.GET_CENSOR_STATUS)!(
      { type: MessageType.GET_CENSOR_STATUS, tabId: 9 },
      reply,
      {},
    );

    expect(setActionStatus).toHaveBeenCalledWith(9, CensorStatus.WORKING);
    expect(reply).toHaveBeenCalledWith({ status: CensorStatus.WORKING });
  });

  test('replies with defaults when persisted settings fail to load', async () => {
    const { handlers, messaging } = createMessagingHarness();
    registerCensorController(messaging, {
      load: async () => {
        throw new Error('storage unavailable');
      },
      save: async () => {},
      broadcast: async () => {},
      setActionStatus: async () => {},
    });

    const reply = mock(() => {});
    handlers.get(MessageType.GET_CENSOR_SETTINGS)!(
      { type: MessageType.GET_CENSOR_SETTINGS },
      reply,
      {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reply).toHaveBeenCalledWith({ settings: createDefaultCensorSettings() });
  });

  test('replies with an error and keeps current settings when saving fails', async () => {
    const { handlers, messaging } = createMessagingHarness();
    const initial = createDefaultCensorSettings();
    registerCensorController(messaging, {
      load: async () => initial,
      save: async () => {
        throw new Error('storage unavailable');
      },
      broadcast: async () => {},
      setActionStatus: async () => {},
    });

    const updateReply = mock(() => {});
    handlers.get(MessageType.UPDATE_CENSOR_SETTINGS)!(
      {
        type: MessageType.UPDATE_CENSOR_SETTINGS,
        settings: { ...initial, delaySeconds: 2 },
      },
      updateReply,
      {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const getReply = mock(() => {});
    handlers.get(MessageType.GET_CENSOR_SETTINGS)!(
      { type: MessageType.GET_CENSOR_SETTINGS },
      getReply,
      {},
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(updateReply).toHaveBeenCalledWith({
      ok: false,
      error: 'Failed to save censor settings',
    });
    expect(getReply).toHaveBeenCalledWith({ settings: initial });
  });
});
