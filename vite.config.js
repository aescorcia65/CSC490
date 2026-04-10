import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: {
    // Prevent Vite from scanning generated Capacitor web assets as app source.
    entries: ['index.html'],
  },
  server: {
    watch: {
      ignored: ['**/ios/**', '**/android/**'],
    },
  },
})