import {
  type ExtensionMessage,
  type MessageTypeValue,
  type RequestOf,
  type ResponseOf,
  isMessageOfType,
} from './messages';

export type MessageTransport = {
  send(message: ExtensionMessage): Promise<unknown>;
  addListener(
    listener: (message: unknown, sendResponse: (response: unknown) => void) => boolean | void,
  ): () => void;
};

export type ReplyCallback<T extends MessageTypeValue> =
  ResponseOf<T> extends void ? never : (response: ResponseOf<T>) => void;

export type MessageHandler<T extends MessageTypeValue> = (
  message: RequestOf<T>,
  reply: ReplyCallback<T>,
) => boolean | void;

export class Messaging {
  constructor(private readonly transport: MessageTransport) {}

  send<T extends MessageTypeValue>(message: RequestOf<T>): Promise<ResponseOf<T>> {
    return this.transport.send(message as ExtensionMessage) as Promise<ResponseOf<T>>;
  }

  on<T extends MessageTypeValue>(type: T, handler: MessageHandler<T>): () => void {
    return this.transport.addListener((message, sendResponse) => {
      if (!isMessageOfType(message, type)) {
        return;
      }

      return handler(message, sendResponse as ReplyCallback<T>);
    });
  }
}
