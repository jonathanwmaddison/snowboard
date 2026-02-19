import { defineConfig } from 'vite';

export default defineConfig({
  base: '/snowboard/',
  server: {
    port: 3008,
    open: true,
  },
  build: {
    target: 'esnext'
  }
});
