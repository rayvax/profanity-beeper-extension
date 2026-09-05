import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { MessageType, createDefaultCensorSettings } from '@beeper/adapter-chrome-content';

const originalChrome = globalThis.chrome;

function popupMarkup(): string {
  return `
    <header class="app-header">
      <h1>SoapTheMouth</h1>
      <p id="status" role="status"></p>
    </header>
    <form id="settings">
      <label class="field">
        <span class="field-label">Источник</span>
        <select name="source">
          <option value="captions">captions</option>
          <option value="ml">ML</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">Эффект</span>
        <select name="effect"><option value="beep">beep</option></select>
      </label>
      <label class="field">
        <span class="field-label">Задержка <output id="delay"></output></span>
        <input name="delaySeconds" type="range" value="1.2" />
      </label>
      <label class="field"><textarea name="literalAdditions"></textarea></label>
      <label class="field"><textarea name="patterns"></textarea></label>
      <label class="field"><textarea name="whitelist"></textarea></label>
      <p id="error" role="alert"></p>
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
    expect(document.querySelector('#delay')?.textContent).toMatch(/^\d\.\d с$/);
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
    expect(document.querySelector('#ml-transcript .partial')).not.toBeNull();
  });
});
