<script setup>
import { normalizeCoordinates, directionsUrl } from '#shared/utils/location.js'
const props = defineProps({ latitude: [Number, String], longitude: [Number, String], address: { type: String, default: '' } })
const point = computed(() => normalizeCoordinates({ latitude: props.latitude, longitude: props.longitude }))
const url = computed(() => directionsUrl(point.value, props.address))
</script>
<template><section class="location-directions" aria-label="Navigasi ke lokasi treatment"><h3><UiIcon name="locations" :size="18" />Lokasi & navigasi</h3><template v-if="point"><ClientOnly><LocationMap :model-value="point" readonly /><template #fallback><div class="location-map map-readonly map-placeholder">Memuat peta lokasi…</div></template></ClientOnly><p class="form-hint">Pin customer: {{ point.latitude.toFixed(7) }}, {{ point.longitude.toFixed(7) }}</p></template><p v-else class="form-hint">Customer belum memasang pin. Navigasi menggunakan alamat tertulis; konfirmasi posisi dengan customer.</p><a v-if="url" :href="url" class="btn btn-primary w-full" target="_blank" rel="noopener noreferrer"><UiIcon name="locations" :size="17" />Buka rute di Google Maps<UiIcon name="up" :size="16" /></a></section></template>
