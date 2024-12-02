import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true
  },
  root: path.join(__dirname),
})
