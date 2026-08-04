import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Youtube Beeper',
    version: '0.0.1',
    permissions: ['offscreen', 'storage'],
    host_permissions: ['https://api.github.com/*', 'https://raw.githubusercontent.com/*'],
    action: {
      default_title: 'Youtube Beeper',
    },
  },
  vite: () => ({
    server: {
      fs: { allow: ['../..'] },
    },
  }),
});
