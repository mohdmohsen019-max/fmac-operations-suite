import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    historyApiFallback: true
  },
  resolve: {
    alias: {
      canvas: path.resolve(__dirname, './src/null-module.js'),
      encoding: path.resolve(__dirname, './src/null-module.js')
    }
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/firebase')) return 'firebase'
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'pdf'
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
          if (id.includes('node_modules/framer-motion')) return 'motion'
        }
      }
    }
  }
})
