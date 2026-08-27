import { describe, expect, mock, test } from 'bun:test';
import {
  CensorSource,
  startCensorContentRuntime,
  type CensorContentRuntimeDependencies,
  type SpeechRecognizer,
  type TimedCensorSessionOptions,
} from '@beeper/adapter-chrome-content';
import {
  MessageType,
  createDefaultCensorSettings,
  createMessaging,
  registerCensorController,
  type MessageTransport,
} from '@beeper/adapter-chrome-sw';

type TransportListener = Parameters<MessageTransport['addListener']>[0];
type TransportMessage = Parameters<MessageTransport['send']>[0];
type TransportContext = Parameters<TransportListener>[1];

function createRuntimeBus() {
  const serviceWorkerListeners = new Set<TransportListener>();
  const contentListeners = new Set<TransportListener>();

  const dispatch = (
    listeners: Set<TransportListener>,
    message: TransportMessage,
    context: TransportContext,
  ): Promise<unknown> =>
    new Promise((resolve) => {
      let keptOpen = false;
      let replied = false;
      const reply = (response: unknown) => {
        replied = true;
        resolve(response);
      };
      listeners.forEach((listener) => {
        if (listener(message, context, reply) === true) keptOpen = true;
      });
      if (!keptOpen && !replied) resolve(undefined);
    });

  const transport = (
    ownListeners: Set<TransportListener>,
    targetListeners: Set<TransportListener>,
    context: TransportContext,
  ): MessageTransport => ({
    send: (message) => dispatch(targetListeners, message, context),
    addListener(listener) {
      ownListeners.add(listener);
      return () => ownListeners.delete(listener);
    },
  });

  return {
    serviceWorker: createMessaging(
      transport(serviceWorkerListeners, contentListeners, { tabId: 7 }),
    ),
    content: createMessaging(transport(contentListeners, serviceWorkerListeners, { tabId: 7 })),
  };
}

describe('settings propagation', () => {
  test('applies a service-worker update to an active content session', async () => {
    const bus = createRuntimeBus();
    const updateSettings = mock(() => {});
    const firstStop = mock(() => {});
    const secondStop = mock(() => {});
    const sessions = [
      { updateSettings, stop: firstStop },
      { updateSettings: mock(() => {}), stop: secondStop },
    ];
    const startSession = mock(() => sessions.shift()!);
    const createTimedtextOptions = mock(() => ({}) as TimedCensorSessionOptions);
    const createMlOptions = mock(() => ({}) as TimedCensorSessionOptions);
    const dependencies: CensorContentRuntimeDependencies = {
      startSession,
      createTimedtextOptions,
      createMlOptions,
    };
    registerCensorController(bus.serviceWorker, {
      load: async () => createDefaultCensorSettings(),
      save: async () => {},
      broadcast: async (settings) => {
        await bus.serviceWorker.send({
          type: MessageType.CENSOR_SETTINGS_UPDATED,
          settings,
        });
      },
      setActionStatus: async () => {},
    });
    const runtime = await startCensorContentRuntime(
      bus.content,
      { workletUrl: 'test.js', recognizer: {} as SpeechRecognizer },
      dependencies,
    );
    const settings = {
      ...createDefaultCensorSettings(),
      source: CensorSource.CAPTIONS,
      effect: 'silence' as const,
    };

    const response = await bus.content.send({
      type: MessageType.UPDATE_CENSOR_SETTINGS,
      settings,
    });

    expect(response).toEqual({ ok: true, settings });
    expect(updateSettings).toHaveBeenCalledWith(settings);
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(createTimedtextOptions).toHaveBeenCalledTimes(1);

    const mlSettings = { ...settings, source: CensorSource.ML };
    await bus.content.send({
      type: MessageType.UPDATE_CENSOR_SETTINGS,
      settings: mlSettings,
    });

    expect(firstStop).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledTimes(2);
    expect(createMlOptions).toHaveBeenCalledTimes(1);
    runtime.stop();
    expect(secondStop).toHaveBeenCalledTimes(1);
  });
});
