export default defineNuxtPlugin(nuxtApp => {
  if (import.meta.dev || !window.isSecureContext || !('serviceWorker' in navigator)) return
  nuxtApp.hook('app:mounted', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    } catch (error) {
      console.warn('Serene: service worker registration failed.', error)
    }
  })
})
