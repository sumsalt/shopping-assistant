import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // 与服务端/Nuxt 保持一致的别名：@core 指向平台无关内核，@ 指向 web
      '@core': resolve(__dirname, 'src'),
      '@': resolve(__dirname, 'web'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'web/server/**/*.test.ts', 'web/composables/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
