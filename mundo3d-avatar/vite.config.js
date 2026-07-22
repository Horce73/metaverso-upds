import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Si tu backend PHP corre en otro puerto (ej. XAMPP en 80),
    // puedes activar un proxy aquí para evitar problemas de CORS/cookies:
    // proxy: {
    //   '/api': 'http://localhost/tu-backend',
    // }
  },
})
