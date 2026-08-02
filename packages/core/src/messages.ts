import type { CensorSettings } from './settings';

export const MessageType = {
  WORD_CAPTURED: 'WORD_CAPTURED',
  WORD_CENSORED: 'WORD_CENSORED',
  GET_CENSOR_SETTINGS: 'GET_CENSOR_SETTINGS',
  UPDATE_CENSOR_SETTINGS: 'UPDATE_CENSOR_SETTINGS',
  CENSOR_SETTINGS_UPDATED: 'CENSOR_SETTINGS_UPDATED',
  CENSOR_STATUS_UPDATED: 'CENSOR_STATUS_UPDATED',
  GET_CENSOR_STATUS: 'GET_CENSOR_STATUS',
} as const;

export const CensorStatus = {
  WAITING: 'waiting',
  WORKING: 'working',
  ERROR: 'error',
} as const;

export type CensorStatusValue = (typeof CensorStatus)[keyof typeof CensorStatus];

export type MessageMap = {
  [MessageType.WORD_CAPTURED]: {
    request: { word: string };
    response: { ok: true; censored: boolean } | { ok: false; error: string };
  };
  [MessageType.WORD_CENSORED]: {
    request: Record<string, never>;
    response: void;
  };
  [MessageType.GET_CENSOR_SETTINGS]: {
    request: Record<string, never>;
    response: { settings: CensorSettings };
  };
  [MessageType.UPDATE_CENSOR_SETTINGS]: {
    request: { settings: CensorSettings };
    response: { ok: true; settings: CensorSettings } | { ok: false; error: string };
  };
  [MessageType.CENSOR_SETTINGS_UPDATED]: {
    request: { settings: CensorSettings };
    response: void;
  };
  [MessageType.CENSOR_STATUS_UPDATED]: {
    request: { status: CensorStatusValue };
    response: void;
  };
  [MessageType.GET_CENSOR_STATUS]: {
    request: { tabId: number };
    response: { status?: CensorStatusValue };
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
