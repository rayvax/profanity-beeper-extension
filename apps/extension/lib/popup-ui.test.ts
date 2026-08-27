import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { MessageType, createDefaultCensorSettings } from '@beeper/adapter-chrome-content';

const originalChrome = globalThis.chrome;

function popupMarkup(): string {
  return `
    <form id="settings">
      <select name="source">
        <option value="captions">captions</option>
        <option value="ml">ML</option>
      </select>
      <select name="effect"><option value="beep">beep</option></select>
      <input name="delaySeconds" value="1.2" />
      <textarea name="literalAdditions"></textarea>
      <textarea name="patterns"></textarea>
      <textarea name="whitelist"></textarea>
      <output id="delay"></output>
      <p id="status"></p>
      <p id="error"></p>
    </form>
    <section id="ml-debug" hidden>
      <div id="ml-transcript"></div>
    </section>`;
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

  test('shows a settings error and live ML transcript diagnostics', async () => {
    const settings = { ...createDefaultCensorSettings(), source: 'ml' as const };
    let runtimeListener: (
      message: unknown,
      sender: chrome.runtime.MessageSender,
    ) => void = () => {};
    globalThis.chrome = {
      tabs: { query: mock(async () => [{ id: 7 }]) },
      runtime: {
        sendMessage: mock(async (message: { type: string }) => {
          if (message.type === MessageType.GET_CENSOR_SETTINGS) return { settings };
          if (message.type === MessageType.GET_CENSOR_STATUS) return { status: 'working' };
          return { ok: false, error: 'Invalid RegExp: [' };
        }),
        onMessage: {
          addListener: mock((listener) => {
            runtimeListener = listener;
          }),
          removeListener: mock(() => {}),
        },
      },
    } as unknown as typeof chrome;

    await import('./popup-ui');
    await flushMessages();
    document.querySelector<HTMLFormElement>('#settings')?.dispatchEvent(new Event('change'));
    await flushMessages();

    expect(document.querySelector('#error')?.textContent).toBe('Invalid RegExp: [');
    runtimeListener(
      {
        type: 'ML_TRANSCRIPT_UPDATED',
        entry: { text: 'дурак', censored: true, final: false },
      },
      { tab: { id: 7 } },
    );

    expect(document.querySelector<HTMLElement>('#ml-debug')?.hidden).toBeFalse();
    expect(document.querySelector('#ml-transcript')?.textContent).toContain('дурак');
    expect(document.querySelector('#ml-transcript .censored')).not.toBeNull();
  });
});
