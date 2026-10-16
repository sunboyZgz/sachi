import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // CLI suites launch Git, Python and build subprocesses in temporary stores.
    maxWorkers: 2,
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
