import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  
  // Add proper MIME type for MP4 files
  assetsInclude: ['**/*.mp4'],
  
  // Configure the dev server
  server: {
    fs: {
      // Allow serving files from parent of project root
      allow: ['..'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})