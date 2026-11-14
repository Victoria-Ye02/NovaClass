import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Listen on the LAN so a phone on the same Wi-Fi can open the QR link during the demo.
  server: { host: '0.0.0.0' },
})
