import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3008,
    open: true,
  },
  build: {
    target: 'esnext'
  }
});
