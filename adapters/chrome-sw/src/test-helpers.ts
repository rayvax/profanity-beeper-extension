import {
  MessageType,
  Messaging,
  type ExtensionMessage,
  type MessageContext,
  type MessageTransport,
} from '@beeper/core';

export function createFakeTransport(): MessageTransport & { sent: ExtensionMessage[] } {
  const listeners: Array<
    (
      message: unknown,
      context: MessageContext,
      sendResponse: (response: unknown) => void,
    ) => boolean | void
  > = [];
  const sent: ExtensionMessage[] = [];

  return {
    sent,
    async send(message) {
      sent.push(message);

      return new Promise((resolve) => {
        let handled = false;

        for (const listener of listeners) {
          const result = listener(message, {}, (response) => {
            if (!handled) {
              handled = true;
              resolve(response);
            }
          });

          if (result === true) {
            break;
          }
        }

        if (!handled && message.type === MessageType.WORD_CENSORED) {
          resolve(undefined);
        }
      });
    },
    addListener(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
  };
}

export function createTestMessaging(): {
  messaging: Messaging;
  transport: ReturnType<typeof createFakeTransport>;
} {
  const transport = createFakeTransport();
  return { messaging: new Messaging(transport), transport };
}
