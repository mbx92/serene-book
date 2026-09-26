<script setup>
defineProps({ countdown: String, remainingSeconds: Number, durationMinutes: Number })
</script>
<template><div class="treatment-countdown" :class="{ 'duration-complete': remainingSeconds === 0 }"><span>Sisa durasi treatment</span><output role="timer" aria-label="Sisa durasi treatment" aria-live="off">{{ countdown }}</output><small>Durasi total: {{ durationMinutes }} menit sejak mulai treatment.</small><p v-if="remainingSeconds === null" class="form-hint">Waktu mulai belum tersedia. Hubungi admin.</p><p v-else-if="remainingSeconds > 0" class="form-hint">Tombol selesai aktif setelah durasi treatment habis.</p><p v-else class="form-hint">Durasi sudah habis. Silakan konfirmasi jika treatment telah selesai.</p></div></template>
