import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { MessageType, createDefaultCensorSettings } from '@beeper/adapter-chrome-content';

const originalChrome = globalThis.chrome;

function popupMarkup(): string {
  return `
    <form id="settings">
      <select name="source"><option value="captions">captions</option></select>
      <select name="effect"><option value="beep">beep</option></select>
      <input name="delaySeconds" value="1.2" />
      <textarea name="literalAdditions"></textarea>
      <textarea name="patterns"></textarea>
      <textarea name="whitelist"></textarea>
      <output id="delay"></output>
      <p id="status"></p>
      <p id="error"></p>
    </form>`;
}

async function flushMessages(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('popup UI', () => {
  beforeAll(() => {
    if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
    document.body.innerHTML = popupMarkup();
  });

  afterAll(() => {
    globalThis.chrome = originalChrome;
    document.body.innerHTML = '';
    GlobalRegistrator.unregister();
  });

  test('shows a settings error returned by the service worker', async () => {
    const settings = createDefaultCensorSettings();
    globalThis.chrome = {
      tabs: { query: mock(async () => [{ id: 7 }]) },
      runtime: {
        sendMessage: mock(async (message: { type: string }) => {
          if (message.type === MessageType.GET_CENSOR_SETTINGS) return { settings };
          if (message.type === MessageType.GET_CENSOR_STATUS) return { status: 'working' };
          return { ok: false, error: 'Invalid RegExp: [' };
        }),
        onMessage: { addListener: mock(() => {}), removeListener: mock(() => {}) },
      },
    } as unknown as typeof chrome;

    await import('./popup-ui');
    await flushMessages();
    document.querySelector<HTMLFormElement>('#settings')?.dispatchEvent(new Event('change'));
    await flushMessages();

    expect(document.querySelector('#error')?.textContent).toBe('Invalid RegExp: [');
  });
});
