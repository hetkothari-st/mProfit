/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, cssCodeSplit: true },
  ssr: { noExternal: ['gsap', /^@fontsource\//] },
  test: { environment: 'node' },
});
