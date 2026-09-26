<script setup>
import { timeLabel } from '#shared/utils/format.js'
const props = defineProps({ order: Object, issued: Object })
const emit = defineEmits(['issued'])
const { error: formatError } = useFeedback()
const busy = ref(false), message = ref(''), copied = ref(''), renewOpen = ref(false), minutes = ref(30)
const current = computed(() => props.issued?.assignmentId === props.order.assignment?.id ? props.issued : null)
async function renew() {
  busy.value = true; message.value = ''
  try { emit('issued', await $fetch(`/api/orders/${props.order.id}/job-link`, { method: 'POST', body: { minutes: minutes.value } })); renewOpen.value = false }
  catch (e) { message.value = formatError(e) }
  finally { busy.value = false }
}
async function copy(value, label) {
  try { await navigator.clipboard.writeText(value); copied.value = label }
  catch { message.value = 'Salin teks dari kolom pesan atau tautan di bawah.' }
}
</script>
<template>
  <section class="panel form-panel whatsapp-card" aria-label="Penawaran job WhatsApp">
    <h2>WhatsApp therapist</h2><p class="muted">{{ order.assignment.therapistName }}</p>
    <p v-if="order.orderStatus === 'ASSIGNED_THERAPIST' && order.jobOffer" class="form-hint">Batas respons: {{ timeLabel(order.jobOffer.offerExpiresAt) }}.</p>
    <template v-if="current">
      <label class="mt-4">Pesan untuk therapist<textarea :value="current.message" readonly rows="8" /></label>
      <label>Tautan konfirmasi job<input :value="current.url" readonly /></label>
      <a v-if="current.whatsappUrl" :href="current.whatsappUrl" class="btn btn-primary w-full" target="_blank" rel="noopener noreferrer">Kirim melalui WhatsApp<UiIcon name="arrow" :size="16" /></a>
      <p v-else class="form-hint">Nomor WhatsApp belum valid. Perbarui nomor di profil therapist sebelum mengirim pesan.</p>
      <p class="form-hint">WhatsApp akan membuka pesan yang sudah disiapkan. Tekan Send untuk mengirimnya.</p>
      <div class="job-buttons"><UiButton variant="secondary" @click="copy(current.message, 'Pesan disalin')">Salin pesan</UiButton><UiButton variant="secondary" @click="copy(current.url, 'Tautan disalin')">Salin tautan</UiButton></div>
      <p v-if="copied" role="status" class="form-hint">{{ copied }}</p>
    </template>
    <p v-else class="form-hint">Buat tautan baru untuk menyiapkan pesan WhatsApp. Tautan sebelumnya akan diganti.</p>
    <UiButton variant="ghost" class="w-full mt-4" :loading="busy" @click="renewOpen = true">{{ order.jobOffer ? 'Buat ulang tautan WhatsApp' : 'Buat tautan WhatsApp' }}</UiButton>
    <p v-if="message" class="error-message" role="alert">{{ message }}</p>
    <UiModal :open="renewOpen" title="Buat tautan WhatsApp" @close="renewOpen = false"><form @submit.prevent="renew"><p class="muted">Tautan sebelumnya akan tidak berlaku. Kirim tautan baru kepada therapist agar konfirmasi dan pembaruan status tetap dapat dilakukan.</p><label v-if="order.orderStatus === 'ASSIGNED_THERAPIST'" class="mt-4">Masa respons<select v-model.number="minutes"><option :value="15">15 menit</option><option :value="30">30 menit</option><option :value="60">60 menit</option><option :value="120">120 menit</option></select></label><p v-if="message" class="error-message" role="alert">{{ message }}</p><div class="modal-actions"><UiButton variant="secondary" @click="renewOpen = false">Batal</UiButton><UiButton type="submit" :loading="busy">Buat dan ganti tautan</UiButton></div></form></UiModal>
  </section>
</template>
