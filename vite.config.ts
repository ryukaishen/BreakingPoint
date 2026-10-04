/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Don't realpath the project root (keeps dev working inside virtualized /
  // symlinked folders such as sandboxed app data directories).
  resolve: { preserveSymlinks: true },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
