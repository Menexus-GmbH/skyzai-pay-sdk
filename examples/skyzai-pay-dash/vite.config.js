import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      events: 'events',
    },
  },
  define: {
    // Some libraries look for global.Process or similar, but main issue is events.
    // 'process.env': {} 
  }
})
