import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web builds use "/" so /login, /dashboard, etc. load JS/CSS correctly on refresh.
// Capacitor builds use --mode capacitor (relative base for the native WebView).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'capacitor' ? './' : '/',
  optimizeDeps: {
    // Prevent Vite from scanning generated Capacitor web assets as app source.
    entries: ['index.html'],
  },
  server: {
    watch: {
      ignored: ['**/ios/**', '**/android/**'],
    },
  },
}))