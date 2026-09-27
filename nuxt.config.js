import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  compatibilityDate: '2026-09-26',
  devtools: { enabled: false },
  css: ['leaflet/dist/leaflet.css', '~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: { sessionSecret: '', databaseUrl: '', public: { appName: 'Serene Spa', mapTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', mapAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  routeRules: {
    '/sw.js': { headers: { 'cache-control': 'no-cache' } },
    '/manifest.webmanifest': { headers: { 'cache-control': 'no-cache' } }
  },
  app: { head: {
    htmlAttrs: { lang: 'id' },
    title: 'Serene — Spa Management',
    meta: [
      { name: 'description', content: 'Operasional spa dan home service dalam satu tempat.' },
      { name: 'theme-color', content: '#315b49' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
    ],
    link: [
      { key: 'app-favicon', rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=3' },
      { key: 'app-apple-icon', rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png', sizes: '180x180' },
      { key: 'app-manifest', rel: 'manifest', href: '/api/public/branding-manifest' }
    ]
  } }
})
