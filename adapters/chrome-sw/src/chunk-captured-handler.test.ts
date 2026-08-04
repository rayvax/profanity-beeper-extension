import { describe, expect, test } from 'bun:test';
import { ChunkMatcher, MessageType } from '@beeper/core';

import { registerChunkCapturedHandler } from './chunk-captured-handler';
import { staticMatchConfig } from './static-match-config';
import { createTestMessaging } from './test-helpers';

const matcher = new ChunkMatcher(staticMatchConfig);

describe('registerChunkCapturedHandler', () => {
  test('replies censored false for non-matching chunks', async () => {
    const { messaging } = createTestMessaging();
    registerChunkCapturedHandler(messaging, matcher);

    const response = await messaging.send({
      type: MessageType.CHUNK_CAPTURED,
      text: 'hello',
    });

    expect(response).toEqual({ ok: true, censored: false });
  });

  test('replies censored true and sends CHUNK_CENSORED for censor tokens', async () => {
    const { messaging, transport } = createTestMessaging();
    registerChunkCapturedHandler(messaging, matcher);

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
