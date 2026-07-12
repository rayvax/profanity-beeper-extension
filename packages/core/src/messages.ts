export const MessageType = {
  WORD_CAPTURED: 'WORD_CAPTURED',
  WORD_CENSORED: 'WORD_CENSORED',
} as const;

export type MessageMap = {
  [MessageType.WORD_CAPTURED]: {
    request: { word: string };
    response: { ok: true; censored: boolean } | { ok: false; error: string };
  };
  [MessageType.WORD_CENSORED]: {
    request: Record<string, never>;
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

export type WordCapturedMessage = RequestOf<typeof MessageType.WORD_CAPTURED>;
export type WordCensoredMessage = RequestOf<typeof MessageType.WORD_CENSORED>;

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
