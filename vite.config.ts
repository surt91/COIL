import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    include: ['tests/**/*.test.ts'],
    // The content fuzzers take seconds locally and longer on CI runners.
    testTimeout: 60000,
  },
});
