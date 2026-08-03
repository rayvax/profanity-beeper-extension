import { describe, expect, mock, test } from 'bun:test';
import { MessageType } from '@beeper/core';

const playBeep = mock(() => {});

mock.module('@beeper/audio', () => ({
  playBeep,
}));

import { registerCensorAudioHandler } from './censor-audio-handler';
import { createTestMessaging } from './test-helpers';

describe('registerCensorAudioHandler', () => {
  test('plays beep when WORD_CENSORED is received', async () => {
    playBeep.mockClear();

    const { messaging } = createTestMessaging();
    registerCensorAudioHandler(messaging);

    await messaging.send({ type: MessageType.WORD_CENSORED });

    expect(playBeep).toHaveBeenCalledTimes(1);
  });
});
