import { MessageType, type CensorSettings } from '@beeper/adapter-chrome-content';
import { chromeMessaging } from './chrome-messaging';

const form = document.querySelector<HTMLFormElement>('#settings')!;
const status = document.querySelector<HTMLElement>('#status')!;
const error = document.querySelector<HTMLElement>('#error')!;
const delay = document.querySelector<HTMLOutputElement>('#delay')!;
const sourceField = form.elements.namedItem('source') as HTMLSelectElement;
const effectField = form.elements.namedItem('effect') as HTMLSelectElement;
const delayField = form.elements.namedItem('delaySeconds') as HTMLInputElement;
const additionsField = form.elements.namedItem('literalAdditions') as HTMLTextAreaElement;
const patternsField = form.elements.namedItem('patterns') as HTMLTextAreaElement;
const whitelistField = form.elements.namedItem('whitelist') as HTMLTextAreaElement;

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function showSettings(settings: CensorSettings): void {
  sourceField.value = settings.source;
  effectField.value = settings.effect;
  delayField.value = String(settings.delaySeconds);
  additionsField.value = settings.literalAdditions.join('\n');
  patternsField.value = settings.patterns.join('\n');
  whitelistField.value = settings.whitelist.join('\n');
  delay.value = `${settings.delaySeconds.toFixed(1)} с`;
}

function readSettings(): CensorSettings {
  return {
    source: sourceField.value as CensorSettings['source'],
    effect: effectField.value as CensorSettings['effect'],
    delaySeconds: Number(delayField.value),
    literalAdditions: lines(additionsField.value),
    patterns: lines(patternsField.value),
    whitelist: lines(whitelistField.value),
  };
}

async function main(): Promise<void> {
  const [{ settings }, [tab]] = await Promise.all([
    chromeMessaging.send({ type: MessageType.GET_CENSOR_SETTINGS }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  showSettings(settings);
  if (tab?.id !== undefined) {
    const result = await chromeMessaging.send({
      type: MessageType.GET_CENSOR_STATUS,
      tabId: tab.id,
    });
    status.textContent = result.status ?? 'waiting';
  }
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === MessageType.CENSOR_STATUS_UPDATED &&
      'status' in message &&
      typeof message.status === 'string'
    ) {
      status.textContent = message.status;
    }
  });

  form.addEventListener('change', async () => {
    const result = await chromeMessaging.send({
      type: MessageType.UPDATE_CENSOR_SETTINGS,
      settings: readSettings(),
    });
    if (!result.ok) {
      error.textContent = result.error;
      return;
    }
    error.textContent = '';
    showSettings(result.settings);
  });
  delayField.addEventListener('input', () => {
    delay.value = `${Number(delayField.value).toFixed(1)} с`;
  });
}

void main();
