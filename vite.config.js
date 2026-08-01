import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  base: '/dev-toolkit/',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.js'],
    // Provide headroom for CI environment and filesystem contention across the test suite
    testTimeout: 10000,
    // .worktrees/* are the swarm orchestrator's isolated task checkouts, each
    // with its own node_modules — scanning them alongside src/ picks up a
    // stale/mismatched React copy and fails with unrelated hook errors.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
});
