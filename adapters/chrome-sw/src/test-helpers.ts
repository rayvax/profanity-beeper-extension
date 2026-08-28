import { MessageType, Messaging, type ExtensionMessage, type MessageTransport } from '@beeper/core';

import type { StoragePort } from './match-config-resolver';

export function createFakeTransport(): MessageTransport & { sent: ExtensionMessage[] } {
  const listeners: Array<
    (message: unknown, sendResponse: (response: unknown) => void) => boolean | void
  > = [];
  const sent: ExtensionMessage[] = [];

  return {
    sent,
    async send(message) {
      sent.push(message);

      return new Promise((resolve) => {
        let handled = false;

        for (const listener of listeners) {
          const result = listener(message, (response) => {
            if (!handled) {
              handled = true;
              resolve(response);
            }
          });

          if (result === true) {
            break;
          }
        }

        if (!handled && message.type === MessageType.CHUNK_CENSORED) {
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

export function createMemoryStorage(initial: Record<string, unknown> = {}): StoragePort {
  const data = { ...initial };

  return {
    get: async (keys) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in data) {
          result[key] = data[key];
        }
      }
      return result;
    },
    set: async (items) => {
      Object.assign(data, items);
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
