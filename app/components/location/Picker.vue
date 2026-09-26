<script setup>
import { normalizeCoordinates, parseLocationInput, searchMapsUrl } from '#shared/utils/location.js'
const props = defineProps({ modelValue: { type: Object, default: null }, address: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])
const point = computed(() => normalizeCoordinates(props.modelValue))
const input = ref('')
const message = ref('')
const locating = ref(false)
const tileError = ref(false)
const mounted = ref(false)
let disposed = false
onMounted(() => { mounted.value = true })
onBeforeUnmount(() => { disposed = true })
function select(value) { emit('update:modelValue', normalizeCoordinates(value)); message.value = '' }
function useInput() {
  const value = parseLocationInput(input.value)
  if (!value) { message.value = 'Gunakan koordinat seperti -8.6705, 115.2126 atau tautan Google Maps lengkap yang memuat koordinat pin. Tautan singkat perlu dibuka dan disalin dari browser terlebih dahulu.'; return }
  select(value)
}
function locate() {
  if (locating.value) return
  message.value = ''
  if (!navigator.geolocation) { message.value = 'Lokasi perangkat tidak tersedia. Pilih titik di peta atau gunakan tautan Maps.'; return }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    position => { if (!disposed) { select({ latitude: position.coords.latitude, longitude: position.coords.longitude }); locating.value = false } },
    error => { if (!disposed) { message.value = error.code === 1 ? 'Izin lokasi belum diberikan. Anda tetap bisa memilih pin di peta.' : 'Lokasi belum ditemukan. Coba lagi atau pilih titik di peta.'; locating.value = false } },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  )
}
function clear() { select(null); input.value = '' }
</script>
<template>
  <section class="location-picker" aria-label="Pin lokasi treatment">
    <div class="location-picker-heading"><div><h3>Pin lokasi treatment <span class="optional-label">Opsional</span></h3><p>Pilih pintu masuk hotel, villa, atau rumah agar therapist mudah menemukan Anda.</p></div><UiIcon name="locations" :size="20" /></div>
    <div class="location-picker-actions"><UiButton variant="secondary" :loading="locating" :disabled="!mounted || locating" @click="locate"><UiIcon name="locations" :size="15" />Gunakan lokasi saya</UiButton><a :href="searchMapsUrl(address)" class="text-link" target="_blank" rel="noopener noreferrer">Cari di Google Maps <UiIcon name="up" :size="14" /></a></div>
    <ClientOnly><LocationMap :model-value="point" @update:model-value="select" @tile-error="tileError = true" @tile-ready="tileError = false" /><template #fallback><div class="location-map map-placeholder">Memuat peta…</div></template></ClientOnly>
    <p v-if="tileError" class="form-hint" role="status">Sebagian peta belum termuat. Anda bisa memakai lokasi perangkat atau menempelkan koordinat.</p>
    <p class="form-hint">Klik peta untuk memasang pin. Geser pin untuk menyesuaikan posisi.</p>
    <div class="location-input-row"><label>Tautan Google Maps atau koordinat<input v-model="input" type="text" placeholder="-8.6705, 115.2126 atau https://www.google.com/maps/…" @keydown.enter.prevent="useInput" /></label><UiButton variant="secondary" @click="useInput">Pasang pin</UiButton></div>
    <p v-if="message" class="location-message" role="alert">{{ message }}</p>
    <div v-if="point" class="selected-location" role="status"><UiIcon name="success" :size="17" /><span>Pin dipilih <small>{{ point.latitude.toFixed(7) }}, {{ point.longitude.toFixed(7) }}</small></span><button class="text-link" type="button" @click="clear">Hapus pin</button></div>
    <p v-else class="form-hint">Belum ada pin dipilih. Alamat tertulis tetap akan disimpan.</p>
  </section>
</template>
