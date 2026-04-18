import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'firebase-config-fallback',
        enforce: 'pre',
        resolveId(source) {
          if (source.includes('firebase-applet-config.json')) {
            const file = path.resolve(__dirname, 'firebase-applet-config.json');
            if (!fs.existsSync(file)) {
              return '\0virtual-firebase-config';
            }
          }
          return null;
        },
        load(id) {
          if (id === '\0virtual-firebase-config') {
            return 'export default {};';
          }
          return null;
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
