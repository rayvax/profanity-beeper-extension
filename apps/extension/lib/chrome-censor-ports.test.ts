import { afterEach, describe, expect, mock, test } from 'bun:test';
import { CensorStatus, MessageType, createDefaultCensorSettings } from '@beeper/adapter-chrome-sw';

import { createChromeCensorPorts } from './chrome-censor-ports';

const originalChrome = globalThis.chrome;

afterEach(() => {
  globalThis.chrome = originalChrome;
});

function installChromeFake() {
  const storage = new Map<string, unknown>();
  const sendTabMessage = mock(async () => {});
  const sendRuntimeMessage = mock(async () => {});
  const setBadgeText = mock(async () => {});
  const badgeText = new Map<number, string>();
  globalThis.chrome = {
    storage: {
      local: {
        get: mock(async (key: string) => ({ [key]: storage.get(key) })),
        set: mock(async (values: Record<string, unknown>) => {
          Object.entries(values).forEach(([key, value]) => storage.set(key, value));
        }),
      },
    },
    tabs: {
      query: mock(async () => [{ id: 7 }]),
      sendMessage: sendTabMessage,
    },
    action: {
      setBadgeText: mock(async ({ tabId, text }: { tabId?: number; text: string }) => {
        setBadgeText(tabId, text);
        if (tabId !== undefined) badgeText.set(tabId, text);
      }),
      setBadgeBackgroundColor: mock(async () => {}),
      getBadgeText: mock(async ({ tabId }: { tabId?: number }) => badgeText.get(tabId ?? -1) ?? ''),
    },
    runtime: { sendMessage: sendRuntimeMessage },
  } as unknown as typeof chrome;
  return { sendRuntimeMessage, sendTabMessage, setBadgeText };
}

describe('createChromeCensorPorts', () => {
  test('persists settings and broadcasts them to YouTube tabs', async () => {
    const { sendTabMessage } = installChromeFake();
    const ports = createChromeCensorPorts();
    const settings = { ...createDefaultCensorSettings(), delaySeconds: 2 };

    await ports.save(settings);
    await ports.broadcast(settings);

    expect(await ports.load()).toEqual(settings);
    expect(sendTabMessage).toHaveBeenCalledWith(7, {
      type: MessageType.CENSOR_SETTINGS_UPDATED,
      settings,
    });
  });

  test('keeps status messages tab-specific and recovers them from the badge', async () => {
    const { sendRuntimeMessage, setBadgeText } = installChromeFake();
    const ports = createChromeCensorPorts();

    await ports.setActionStatus(7, CensorStatus.WORKING);

    expect(setBadgeText).toHaveBeenCalledWith(7, 'ON');
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: MessageType.CENSOR_STATUS_UPDATED,
      status: CensorStatus.WORKING,
      tabId: 7,
    });
    expect(await ports.getActionStatus?.(7)).toBe(CensorStatus.WORKING);
  });
});
