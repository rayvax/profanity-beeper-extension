export const MessageType = {
  WORD_FOUND: 'WORD_FOUND',
  PLAY_BEEP: 'PLAY_BEEP',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export type WordFoundMessage = {
  type: typeof MessageType.WORD_FOUND;
  word: string;
};

export type PlayBeepMessage = {
  type: typeof MessageType.PLAY_BEEP;
};
