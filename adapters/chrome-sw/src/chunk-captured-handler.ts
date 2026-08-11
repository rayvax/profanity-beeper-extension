import { ChunkMatcher, MessageType, type MatchConfig, type Messaging } from '@beeper/core';

/** Bundled fallback patterns when storage/remote have no config yet. */
export const STATIC_MATCH_CONFIG: MatchConfig = {
  patterns: ['\\[(?: |\\u00A0)__(?: |\\u00A0)\\]'],
  terms: [],
};

export type ChunkMatcherLike = {
  matches(text: string): boolean;
};

export function registerChunkCapturedHandler(
  messaging: Messaging,
  matcher: ChunkMatcherLike = new ChunkMatcher(STATIC_MATCH_CONFIG),
): void {
  messaging.on(MessageType.CHUNK_CAPTURED, (message, reply) => {
    if (!matcher.matches(message.text)) {
      return reply({ ok: true, censored: false });
    }

    void messaging.send({ type: MessageType.CHUNK_CENSORED, text: message.text });

    return reply({ ok: true, censored: true });
  });
}
