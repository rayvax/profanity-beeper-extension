import { ChunkMatcher, MessageType, type Messaging } from '@beeper/core';

import { staticMatchConfig } from './static-match-config';

const matcher = new ChunkMatcher(staticMatchConfig);

export function registerChunkCapturedHandler(messaging: Messaging): void {
  messaging.on(MessageType.CHUNK_CAPTURED, (message, reply) => {
    if (!matcher.matches(message.text)) {
      return reply({ ok: true, censored: false });
    }

    void messaging.send({ type: MessageType.CHUNK_CENSORED, text: message.text });

    return reply({ ok: true, censored: true });
  });
}
