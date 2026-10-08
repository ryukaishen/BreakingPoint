/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Don't realpath the project root (keeps dev working inside virtualized /
  // symlinked folders such as sandboxed app data directories).
  resolve: { preserveSymlinks: true },
  // A tool or a second session can hand the dev server a port through PORT; it must then use exactly that one.
  // Without PORT it behaves as before: 5173, or the next free port.
  server: { port: Number(process.env.PORT) || 5173, strictPort: !!process.env.PORT, host: true },
  preview: { port: 4173, host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
