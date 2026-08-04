import { MessageType, type Messaging } from '@beeper/core';

export type ChunkMatcherLike = {
  matches(text: string): boolean;
};

export function registerChunkCapturedHandler(
  messaging: Messaging,
  matcher: ChunkMatcherLike,
): void {
  messaging.on(MessageType.CHUNK_CAPTURED, (message, reply) => {
    if (!matcher.matches(message.text)) {
      return reply({ ok: true, censored: false });
    }

    void messaging.send({ type: MessageType.CHUNK_CENSORED, text: message.text });

    return reply({ ok: true, censored: true });
  });
}
