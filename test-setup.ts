import { afterEach, beforeEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const TEST_URL = 'https://www.youtube.com/watch?v=test123';

if (!GlobalRegistrator.isRegistered) {
  GlobalRegistrator.register({ url: TEST_URL });
}

beforeEach(() => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register({ url: TEST_URL });
  }
});

afterEach(() => {
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});
