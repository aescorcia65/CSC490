import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'capacitor' ? './' : '/',
  optimizeDeps: {
    entries: ['index.html'],
    include: ['react', 'react-dom', 'react-router-dom', '@supabase/supabase-js', 'framer-motion'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          const p = id.split("\\").join("/");
          if (p.includes("@supabase")) return "vendor-supabase";
          if (p.includes("framer-motion")) return "vendor-motion";
          if (/\/node_modules\/(react\/|react-dom\/|react-router\/|scheduler\/)/.test(p)) return "vendor-react";
        },
      },
    },
  },
  server: {
    watch: {
      ignored: ['**/ios/**', '**/android/**'],
    },
  },
}))