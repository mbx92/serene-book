<script setup>
const ready = useState('app-ready', () => false)
onMounted(() => { ready.value = true })
</script>
<template><div :data-app-ready="ready"><NuxtLayout><NuxtPage /></NuxtLayout><UiToast /></div></template>
