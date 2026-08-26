import {
  CensorSource,
  CensorStatus,
  MessageType,
  createDefaultCensorSettings,
  type CensorSettings,
  type Messaging,
} from '@beeper/core';

import { startCaptionBeeper, type TranscriptBeeperSession } from './caption-beeper';
import {
  createMlCensorSessionOptions,
  createTimedtextCensorSessionOptions,
  type MlCensorSessionOptions,
} from './transcript-session-options';
import type { TimedCensorSessionOptions } from './caption-beeper';

export type CensorContentRuntime = { stop(): void };

export type CensorContentRuntimeDependencies = {
  startSession(messaging: Messaging, options: TimedCensorSessionOptions): TranscriptBeeperSession;
  createTimedtextOptions(
    settings: CensorSettings,
    onStatus: TimedCensorSessionOptions['onStatus'],
  ): TimedCensorSessionOptions;
  createMlOptions(
    settings: CensorSettings,
    mlOptions: MlCensorSessionOptions,
    onStatus: TimedCensorSessionOptions['onStatus'],
  ): TimedCensorSessionOptions;
};

export async function startCensorContentRuntime(
  messaging: Messaging,
  mlOptions: MlCensorSessionOptions,
  dependencies: CensorContentRuntimeDependencies = {
    startSession: startCaptionBeeper,
    createTimedtextOptions: createTimedtextCensorSessionOptions,
    createMlOptions: createMlCensorSessionOptions,
  },
): Promise<CensorContentRuntime> {
  let session: TranscriptBeeperSession | undefined;
  let currentSettings: CensorSettings | undefined;
  const sendStatus = (status: 'loading' | 'working' | 'error') => {
    void messaging.send({
      type: MessageType.CENSOR_STATUS_UPDATED,
      status: status === 'loading' ? CensorStatus.WAITING : status,
    });
  };
  const start = (settings: CensorSettings) => {
    session?.stop();
    session = dependencies.startSession(
      messaging,
      settings.source === CensorSource.ML
        ? dependencies.createMlOptions(settings, mlOptions, sendStatus)
        : dependencies.createTimedtextOptions(settings, sendStatus),
    );
    currentSettings = settings;
  };
  const applySettings = (settings: CensorSettings) => {
    if (session && currentSettings?.source === settings.source) {
      session.updateSettings(settings);
      currentSettings = settings;
      return;
    }
    start(settings);
  };
  const disposeSettings = messaging.on(MessageType.CENSOR_SETTINGS_UPDATED, (message) =>
    applySettings(message.settings),
  );

  let settings = createDefaultCensorSettings();
  try {
    const response = await messaging.send({ type: MessageType.GET_CENSOR_SETTINGS });
    settings = response.settings;
  } catch (error) {
    console.error('[Caption Beeper] failed to load Censor settings, using defaults', error);
  }
  if (!currentSettings) start(settings);

  return {
    stop() {
      disposeSettings();
      session?.stop();
    },
  };
}
