export const MessageType = {
  CHUNK_CAPTURED: 'CHUNK_CAPTURED',
  CHUNK_CENSORED: 'CHUNK_CENSORED',
} as const;

export type MessageMap = {
  [MessageType.CHUNK_CAPTURED]: {
    request: { text: string };
    response: { ok: true; censored: boolean } | { ok: false; error: string };
  };
  [MessageType.CHUNK_CENSORED]: {
    request: { text: string };
    response: void;
  };
};

export type MessageTypeValue = keyof MessageMap;

type EmptyRequest = Record<string, never>;

export type RequestOf<T extends MessageTypeValue> = MessageMap[T]['request'] extends EmptyRequest
  ? { type: T }
  : { type: T } & MessageMap[T]['request'];

export type ResponseOf<T extends MessageTypeValue> = MessageMap[T]['response'];

export type ExtensionMessage = {
  [K in MessageTypeValue]: RequestOf<K>;
}[MessageTypeValue];

export type ChunkCapturedMessage = RequestOf<typeof MessageType.CHUNK_CAPTURED>;
export type ChunkCensoredMessage = RequestOf<typeof MessageType.CHUNK_CENSORED>;

export function isMessageOfType<T extends MessageTypeValue>(
  message: unknown,
  type: T,
): message is RequestOf<T> {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type: unknown }).type === type
  );
}
