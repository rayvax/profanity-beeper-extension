import {
  CensorStatus,
  MessageType,
  createDefaultCensorSettings,
  validateCensorSettings,
  type CensorSettings,
  type CensorStatusValue,
  type CensorControllerPorts,
} from '@beeper/adapter-chrome-sw';

const SETTINGS_KEY = 'censorSettings';

export function createChromeCensorPorts(): CensorControllerPorts {
  return {
    async load() {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      const settings = result[SETTINGS_KEY] as CensorSettings | undefined;
      return settings && validateCensorSettings(settings).ok
        ? settings
        : createDefaultCensorSettings();
    },
    async save(settings) {
      await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    },
    async broadcast(settings) {
      const tabs = await chrome.tabs.query({ url: '*://www.youtube.com/*' });
      await Promise.all(
        tabs.flatMap((tab) =>
          tab.id === undefined
            ? []
            : [
                chrome.tabs
                  .sendMessage(tab.id, {
                    type: MessageType.CENSOR_SETTINGS_UPDATED,
                    settings,
                  })
                  .catch(() => undefined),
              ],
        ),
      );
    },
    async setActionStatus(tabId, status) {
      await chrome.action.setBadgeText({ tabId, text: badgeText(status) });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor(status) });
      await chrome.runtime
        .sendMessage({ type: MessageType.CENSOR_STATUS_UPDATED, status, tabId })
        .catch(() => undefined);
    },
    async getActionStatus(tabId) {
      return statusFromBadge(await chrome.action.getBadgeText({ tabId }));
    },
  };
}

function badgeText(status: CensorStatusValue): string {
  return status === CensorStatus.WORKING ? 'ON' : status === CensorStatus.WAITING ? '…' : '!';
}

function badgeColor(status: CensorStatusValue): string {
  return status === CensorStatus.ERROR ? '#b3261e' : '#1769aa';
}

function statusFromBadge(text: string): CensorStatusValue | undefined {
  if (text === 'ON') return CensorStatus.WORKING;
  if (text === '…') return CensorStatus.WAITING;
  if (text === '!') return CensorStatus.ERROR;
  return undefined;
}
