import { describe, expect, test } from 'bun:test';
import { MessageType } from '@beeper/core';

import { registerWordCapturedHandler } from './word-captured-handler';
import { createTestMessaging } from './test-helpers';

describe('registerWordCapturedHandler', () => {
  test('replies censored false for non-trigger words', async () => {
    const { messaging } = createTestMessaging();
    registerWordCapturedHandler(messaging);

    const response = await messaging.send({
      type: MessageType.WORD_CAPTURED,
      word: 'hello',
    });

    expect(response).toEqual({ ok: true, censored: false });
  });

  test('replies censored true and sends WORD_CENSORED for trigger words', async () => {
    const { messaging, transport } = createTestMessaging();
    registerWordCapturedHandler(messaging);

    const response = await messaging.send({
      type: MessageType.WORD_CAPTURED,
      word: '[ __ ]',
    });

    expect(response).toEqual({ ok: true, censored: true });
    expect(transport.sent).toContainEqual({ type: MessageType.WORD_CENSORED });
  });
});
