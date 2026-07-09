import { ensureAudio, registerWordFoundHandler } from '@beeper/adapter-chrome-sw';

export default defineBackground(async () => {
  await ensureAudio();
  registerWordFoundHandler();
});
