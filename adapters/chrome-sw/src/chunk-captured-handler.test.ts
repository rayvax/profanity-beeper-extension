import { describe, expect, test } from 'bun:test';
import { MessageType } from '@beeper/core';

import { registerChunkCapturedHandler } from './chunk-captured-handler';
import { createTestMessaging } from './test-helpers';

describe('registerChunkCapturedHandler', () => {
  test('replies censored false for non-matching chunks', async () => {
    const { messaging } = createTestMessaging();
    registerChunkCapturedHandler(messaging);

    const response = await messaging.send({
      type: MessageType.CHUNK_CAPTURED,
      text: 'hello',
    });

    expect(response).toEqual({ ok: true, censored: false });
  });

  test('replies censored true and sends CHUNK_CENSORED for censor tokens', async () => {
    const { messaging, transport } = createTestMessaging();
    registerChunkCapturedHandler(messaging);

    const response = await messaging.send({
      type: MessageType.CHUNK_CAPTURED,
      text: '[ __ ]',
    });

    expect(response).toEqual({ ok: true, censored: true });
    expect(transport.sent).toContainEqual({
      type: MessageType.CHUNK_CENSORED,
      text: '[ __ ]',
    });
  });
});
