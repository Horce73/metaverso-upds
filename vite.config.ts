import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Vite bloquea por defecto los Host desconocidos: sin esto, abrir la app
    // por un tunel (*.trycloudflare.com / ngrok) devuelve "Blocked request".
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
    // El cliente HMR debe apuntar al puerto publico del tunel, no al 5173 local.
    hmr: { clientPort: 443, protocol: 'wss' },
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/peer': { target: 'http://localhost:3001', ws: true }
    }
  }
})
