<script setup>
const branding = useBranding()
const { data: savedBranding } = await useFetch('/api/public/branding')
if (savedBranding.value) branding.value = savedBranding.value
useHead(() => ({
  title: branding.value.appName,
  link: [
    { key: 'app-favicon', rel: 'icon', type: branding.value.customFavicon ? 'image/png' : 'image/svg+xml', href: branding.value.faviconUrl },
    { key: 'app-apple-icon', rel: 'apple-touch-icon', sizes: '180x180', href: branding.value.customFavicon ? `/api/public/branding-icon/apple?v=${branding.value.version}` : '/icons/apple-touch-icon.png' },
    { key: 'app-manifest', rel: 'manifest', href: `/api/public/branding-manifest?v=${branding.value.version}` }
  ]
}))
const ready = useState('app-ready', () => false)
onMounted(() => { ready.value = true })
</script>
<template><div :data-app-ready="ready"><NuxtLayout><NuxtPage /></NuxtLayout><UiToast /></div></template>
