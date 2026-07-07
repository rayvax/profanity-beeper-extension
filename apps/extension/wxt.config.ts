import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'Youtube Beeper',
    version: '1.0.0',
    permissions: ['offscreen'],
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
