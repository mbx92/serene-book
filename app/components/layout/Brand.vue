<script setup>
defineProps({ subtitle: { type: String, default: '' } })
const branding = useBranding()
</script>
<template><span class="brand-icon"><img :src="branding.logoUrl" alt="" width="43" height="43" /></span><span class="brand-name">{{ branding.appName }}<span v-if="subtitle" class="brand-sub">{{ subtitle }}</span></span></template>
