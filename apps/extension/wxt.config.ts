import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: 'dist',
  modules: ['@wxt-dev/auto-icons'],
  autoIcons: {
    baseIconPath: 'assets/icon.svg',
    developmentIndicator: false,
    sizes: [16, 32, 48, 96, 128],
  },
  manifest: {
    name: 'SoapTheMouth',
    version: '0.0.1',
    permissions: ['offscreen', 'storage', 'tabs'],
    action: {
      default_title: 'SoapTheMouth',
    },
    sandbox: {
      pages: ['sandbox.html'],
    },
    content_security_policy: {
      sandbox:
        "sandbox allow-scripts; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self' blob: data:",
    },
    web_accessible_resources: [
      {
        resources: [
          'sandbox.html',
          'sandbox.js',
          'lib/vosk.js',
          'audio-worklet.js',
          'model/model.tar.gz',
        ],
        matches: ['*://www.youtube.com/*'],
      },
    ],
  },
  vite: () => ({
    server: {
      fs: { allow: ['../..'] },
    },
  }),
});
