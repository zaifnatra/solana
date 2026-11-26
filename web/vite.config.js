import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import process from 'node:process';

const apiTarget = process.env.MTL_API_PROXY || 'http://127.0.0.1:8080';
export default defineConfig({
  plugins: [react(), nodePolyfills()],
  server: { proxy: { '/api': apiTarget, '/healthz': apiTarget, '/readyz': apiTarget } },
});
