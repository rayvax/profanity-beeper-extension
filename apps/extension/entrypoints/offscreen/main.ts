import { playBeep } from '@beeper/audio';
import { MessageType } from '@beeper/core';

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MessageType.PLAY_BEEP) {
    playBeep();
  }
});
