import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vitest replaces Jest for traffic-dashboard.
 *
 * Jest 30 currently hangs silently on Node 24 even for trivial tests (the
 * Next.js 16 jest wrapper and the raw babel-jest path both exhibit the same
 * behavior). Vitest runs natively on Node 24 with the same describe/it/expect
 * API and @testing-library matchers, so the existing tests work unchanged.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],

    coverage: {
      provider: 'v8',
      // 'text' prints a summary in the terminal; 'lcov' is what SonarQube reads
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/*.d.ts',
        'src/app/layout.tsx',   // boilerplate — no logic to cover
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
