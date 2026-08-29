import type { StoragePort } from '@beeper/adapter-chrome-sw';

export const chromeStorage: StoragePort = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

export function onMatchConfigStorageChanged(listener: () => void): () => void {
  const chromeListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName === 'local' && (changes.matchConfig || changes.matchConfigMeta)) {
      listener();
    }
  };

  chrome.storage.onChanged.addListener(chromeListener);
  return () => chrome.storage.onChanged.removeListener(chromeListener);
}
