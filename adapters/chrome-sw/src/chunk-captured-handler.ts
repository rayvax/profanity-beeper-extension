import { ChunkMatcher, MessageType, type MatchConfig, type Messaging } from '@beeper/core';

/** Static match config for phase B ticket #15 — remote fetch arrives later. */
export const STATIC_MATCH_CONFIG: MatchConfig = {
  patterns: ['\\[(?: |\\u00A0)__(?: |\\u00A0)\\]'],
  terms: [],
};

export function registerChunkCapturedHandler(
  messaging: Messaging,
  config: MatchConfig = STATIC_MATCH_CONFIG,
): void {
  const matcher = new ChunkMatcher(config);

  messaging.on(MessageType.CHUNK_CAPTURED, (message, reply) => {
    if (!matcher.matches(message.text)) {
      return reply({ ok: true, censored: false });
    }

    void messaging.send({ type: MessageType.CHUNK_CENSORED, text: message.text });

    return reply({ ok: true, censored: true });
  });
}
