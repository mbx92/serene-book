<script setup>
import L from 'leaflet'
import { normalizeCoordinates } from '#shared/utils/location.js'
const props = defineProps({ modelValue: { type: Object, default: null }, readonly: Boolean })
const emit = defineEmits(['update:modelValue', 'ready', 'tile-error', 'tile-ready'])
const container = ref(null)
const config = useRuntimeConfig()
let map, marker, observer
let disposed = false
function updateMarker() {
  const point = normalizeCoordinates(props.modelValue)
  if (!point) { if (marker) { marker.remove(); marker = null }; return }
  const position = [point.latitude, point.longitude]
  if (marker) marker.setLatLng(position)
  else {
    marker = L.marker(position, {
      draggable: !props.readonly,
      title: 'Pin lokasi treatment', alt: 'Pin lokasi treatment',
      icon: L.divIcon({ className: 'spa-map-marker', html: '<span class="spa-map-pin"><span></span></span>', iconSize: [32, 40], iconAnchor: [16, 40] })
    }).addTo(map)
    marker.on('dragend', () => pick(marker.getLatLng()))
  }
  if (!map.getBounds().contains(position) || map.getZoom() < 15) map.setView(position, 16)
}
function pick(latlng) {
  const wrapped = latlng.wrap()
  const point = normalizeCoordinates({ latitude: wrapped.lat, longitude: wrapped.lng })
  if (point && !props.readonly) emit('update:modelValue', point)
}
onMounted(async () => {
  await nextTick()
  if (disposed || !container.value) return
  const point = normalizeCoordinates(props.modelValue)
  map = L.map(container.value, { scrollWheelZoom: false, zoomControl: true }).setView(point ? [point.latitude, point.longitude] : [-8.6705, 115.2126], point ? 16 : 11)
  const tiles = L.tileLayer(config.public.mapTileUrl, { maxZoom: 19, attribution: config.public.mapAttribution, keepBuffer: 0 })
  tiles.on('tileerror', () => emit('tile-error'))
  tiles.on('tileload', () => emit('tile-ready'))
  tiles.addTo(map)
  if (!props.readonly) map.on('click', event => pick(event.latlng))
  updateMarker()
  observer = new ResizeObserver(() => map?.invalidateSize())
  observer.observe(container.value)
  emit('ready')
})
watch(() => props.modelValue, () => { if (map) updateMarker() }, { deep: true })
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); map?.remove(); map = null })
</script>
<template><div ref="container" :class="['location-map', { 'map-readonly': readonly }]" role="region" :aria-label="readonly ? 'Peta lokasi treatment' : 'Peta untuk memilih pin lokasi treatment'" /></template>
