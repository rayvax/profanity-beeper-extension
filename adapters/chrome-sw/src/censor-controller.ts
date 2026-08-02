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
};

export function registerCensorController(messaging: Messaging, ports: CensorControllerPorts): void {
  let settings = createDefaultCensorSettings();
  const statuses = new Map<number, CensorStatusValue>();
  const ready = ports.load().then((loaded) => {
    settings = loaded;
  });

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

    void ready.then(async () => {
      settings = validation.settings;
      await ports.save(settings);
      await ports.broadcast(settings);
      reply({ ok: true, settings });
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
    reply({ status: statuses.get(message.tabId) ?? CensorStatus.WAITING });
  });
}
