import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '2026-09-26',
  devtools: { enabled: false },
  css: ['leaflet/dist/leaflet.css', '~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: { sessionSecret: '', databaseUrl: '', public: { appName: 'Serene Spa', mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  app: { head: { title: 'Serene — Spa Management', meta: [{ name: 'description', content: 'Operasional spa dan home service dalam satu tempat.' }] } }
})
