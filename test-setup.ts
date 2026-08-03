import { afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'https://www.youtube.com/watch?v=test123' });

afterEach(() => {
  document.body.innerHTML = '';
});
