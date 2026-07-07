import { registerWordFoundHandler } from '@beeper/background';

export default defineBackground(() => {
  registerWordFoundHandler();
});
