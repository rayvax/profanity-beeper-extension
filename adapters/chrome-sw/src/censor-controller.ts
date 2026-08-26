import {
  CensorStatus,
  MessageType,
  createDefaultCensorSettings,
  validateCensorSettings,
  type CensorSettings,
  type CensorStatusValue,
  type Messaging,
} from '@beeper/core';

export type CensorControllerPorts = {
  load(): Promise<CensorSettings>;
  save(settings: CensorSettings): Promise<void>;
  broadcast(settings: CensorSettings): Promise<void>;
  setActionStatus(tabId: number, status: CensorStatusValue): Promise<void>;
  getActionStatus?(tabId: number): Promise<CensorStatusValue | undefined>;
};

export function registerCensorController(messaging: Messaging, ports: CensorControllerPorts): void {
  let settings = createDefaultCensorSettings();
  const statuses = new Map<number, CensorStatusValue>();
  const ready = ports.load().then(
    (loaded) => {
      settings = loaded;
    },
    // Fall back to defaults; a rejected load must not wedge every reply below.
    (error: unknown) => {
      console.error('[Beeper] failed to load censor settings, using defaults', error);
    },
  );

  messaging.on(MessageType.GET_CENSOR_SETTINGS, (_message, reply) => {
    void ready.then(() => reply({ settings }));
    return true;
  });

  messaging.on(MessageType.UPDATE_CENSOR_SETTINGS, (message, reply) => {
    const validation = validateCensorSettings(message.settings);
    if (!validation.ok) {
      reply(validation);
      return;
    }

    void ready
      .then(async () => {
        const nextSettings = validation.settings;
        await ports.save(nextSettings);
        settings = nextSettings;
        await ports.broadcast(nextSettings);
        reply({ ok: true, settings: nextSettings });
      })
      .catch((error: unknown) => {
        console.error('[Beeper] failed to save censor settings', error);
        reply({ ok: false, error: 'Failed to save censor settings' });
      });
    return true;
  });

  messaging.on(MessageType.CENSOR_STATUS_UPDATED, (message, _reply, context) => {
    if (context.tabId === undefined) {
      return;
    }

    statuses.set(context.tabId, message.status);
    void ports.setActionStatus(context.tabId, message.status);
  });

  messaging.on(MessageType.GET_CENSOR_STATUS, (message, reply) => {
    const status = statuses.get(message.tabId);
    if (status || !ports.getActionStatus) {
      reply({ status: status ?? CensorStatus.WAITING });
      return;
    }

    void ports.getActionStatus(message.tabId).then(
      (persistedStatus) => reply({ status: persistedStatus ?? CensorStatus.WAITING }),
      () => reply({ status: CensorStatus.WAITING }),
    );
    return true;
  });
}
