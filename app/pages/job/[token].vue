<script setup>
import { dateLabel, timeLabel } from '#shared/utils/format.js'
import { JOB_ACTION_LABELS } from '#shared/constants/index.js'
import { whatsappUrl } from '#shared/utils/whatsapp.js'
definePageMeta({ layout: 'auth' })
useHead({ title: 'Konfirmasi job — Serene', meta: [{ name: 'robots', content: 'noindex, nofollow, nosnippet' }, { name: 'referrer', content: 'strict-origin' }] })
const route = useRoute()
const endpoint = computed(() => `/api/public/jobs/${route.params.token}`)
const { data: job, refresh, error } = await useFetch(endpoint)
const { countdown, remainingSeconds: treatmentRemaining, canComplete: canFinishTreatment } = useTreatmentCountdown(() => job.value?.treatment, refresh)
const { error: formatError } = useFeedback()
const busy = ref(false), message = ref(''), notice = ref(''), confirming = ref(''), reason = ref('')
const mounted = ref(false), now = ref(Date.now())
let clock
onMounted(() => { mounted.value = true; clock = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => clearInterval(clock))
const expired = computed(() => job.value?.state === 'OFFER' && new Date(job.value.offerExpiresAt).getTime() <= now.value)
const remaining = computed(() => Math.max(0, Math.ceil((new Date(job.value?.offerExpiresAt).getTime() - now.value) / 60000)))
const unavailable = computed(() => error.value || !job.value || ['UNAVAILABLE', 'EXPIRED', 'REJECTED'].includes(job.value.state) || expired.value)
const unavailableTitle = computed(() => job.value?.state === 'REJECTED' ? 'Job sudah ditolak' : job.value?.state === 'EXPIRED' || expired.value ? 'Penawaran kedaluwarsa' : 'Tautan sudah tidak berlaku')
const nextAction = computed(() => ({ ACCEPTED: 'on-the-way', ON_THE_WAY: 'arrived', ARRIVED: 'start', IN_PROGRESS: 'complete' })[job.value?.orderStatus])
const contact = computed(() => whatsappUrl(job.value?.officePhone, `Halo admin, saya ingin menanyakan job ${job.value?.orderNumber || ''}.`))
usePolling(async () => { if (!busy.value && !confirming.value) await refresh() })
function ask(action) { if (action === 'complete' && !canFinishTreatment.value) return; confirming.value = action; reason.value = ''; message.value = '' }
async function submit() {
  busy.value = true; message.value = ''
  try {
    job.value = await $fetch(`${endpoint.value}/action`, { method: 'POST', body: { action: confirming.value, notes: reason.value } })
    notice.value = 'Konfirmasi tersimpan. Tim admin sudah dapat melihat status job Anda.'
    confirming.value = ''
  } catch (e) { message.value = formatError(e); await refresh() }
  finally { busy.value = false }
}
</script>
<template>
  <div class="job-page">
    <header class="job-brand"><span class="brand-icon"><UiIcon name="leaf" :size="24" /></span><span>serene</span></header>
    <main v-if="unavailable" class="panel form-panel job-unavailable"><UiIcon name="locations" :size="30" /><h1>{{ unavailableTitle }}</h1><p class="muted">{{ job?.state === 'REJECTED' ? 'Keputusan Anda telah dicatat. Hubungi admin untuk penawaran berikutnya.' : 'Hubungi admin melalui WhatsApp untuk mendapatkan penawaran atau tautan terbaru.' }}</p><p v-if="message" class="error-message" role="alert">{{ message }}</p></main>
    <main v-else>
      <p class="eyebrow">JOB UNTUK {{ job.therapistName }}</p>
      <h1>{{ job.state === 'OFFER' ? 'Ada penawaran untuk Anda.' : 'Job Anda.' }}</h1>
      <p class="muted">{{ job.orderNumber }}</p>
      <p v-if="notice" class="job-notice" role="status">{{ notice }}</p>
      <section class="panel form-panel mt-5"><div class="panel-heading no-pad"><h2>Jadwal & treatment</h2><UiBadge :status="job.orderStatus" /></div><dl class="job-fields"><div><dt>Tanggal</dt><dd>{{ dateLabel(job.bookingDate) }}</dd></div><div><dt>Waktu</dt><dd>{{ job.bookingTime }} · {{ job.timezone }}</dd></div><div><dt>Area</dt><dd>{{ job.area }}</dd></div><div><dt>Durasi</dt><dd>{{ job.durationMinutes }} menit</dd></div></dl><div v-for="(item,index) in job.items" :key="index" class="job-treatment"><strong>{{ item.name }}</strong><small>{{ item.durationMinutes }} menit × {{ item.qty }}</small></div></section>
      <section v-if="job.state === 'OFFER'" class="panel form-panel mt-5"><h2>Apakah Anda bisa mengambil job ini?</h2><p class="form-hint">Periksa jadwal dan waktu perjalanan sebelum menerima.</p><p class="job-expiry" role="status">Sisa waktu respons: {{ remaining }} menit. Batas: {{ timeLabel(job.offerExpiresAt) }}.</p><div class="job-buttons"><UiButton :disabled="!mounted || busy" @click="ask('accept')">Ambil job</UiButton><UiButton variant="secondary" :disabled="!mounted || busy" @click="ask('reject')">Tidak bisa</UiButton></div><p class="form-hint">Alamat lengkap tersedia setelah job diterima.</p></section>
      <template v-else>
        <section class="panel form-panel mt-5"><h2>Customer & lokasi treatment</h2><h3 class="mt-4">{{ job.customerName }}</h3><p class="muted mt-2">{{ job.address }}</p><a :href="whatsappUrl(job.customerPhone, `Halo, saya ${job.therapistName}, therapist untuk booking ${job.orderNumber}.`)" class="text-link mt-2" target="_blank" rel="noopener noreferrer">Hubungi customer via WhatsApp</a><LocationDirections :latitude="job.latitude" :longitude="job.longitude" :address="job.address" /><p v-if="job.notes" class="note-box">{{ job.notes }}</p></section>
        <section class="panel form-panel mt-5"><template v-if="nextAction"><h2>Langkah berikutnya</h2><p class="form-hint">Perbarui status sesuai kondisi Anda agar admin dapat memantau pelayanan.</p><OrderTreatmentCountdown v-if="job.orderStatus === 'IN_PROGRESS'" :countdown="countdown" :remaining-seconds="treatmentRemaining" :duration-minutes="job.treatment?.durationMinutes" /><UiButton class="w-full mt-4" :disabled="!mounted || busy || (nextAction === 'complete' && !canFinishTreatment)" @click="ask(nextAction)">{{ JOB_ACTION_LABELS[nextAction] }}</UiButton></template><template v-else><h2>Treatment selesai</h2><p class="muted">Terima kasih. Tim admin akan menangani pembayaran dan penutupan order.</p></template></section>
      </template>
      <p v-if="message" class="error-message mt-4" role="alert">{{ message }}</p>
      <a v-if="contact" :href="contact" class="btn btn-secondary w-full mt-5" target="_blank" rel="noopener noreferrer">Hubungi admin via WhatsApp</a>
    </main>
    <footer class="job-footer">Serene Wellness · Simpan tautan ini untuk memperbarui status job.</footer>
    <UiModal :open="!!confirming && !unavailable" :title="JOB_ACTION_LABELS[confirming]" @close="confirming = ''"><form @submit.prevent="submit"><p class="muted">{{ confirming === 'accept' ? 'Dengan menerima, Anda mengonfirmasi siap melayani pada jadwal yang tertera.' : confirming === 'reject' ? 'Berikan alasan agar admin dapat mengatur penugasan berikutnya.' : 'Konfirmasikan bahwa status ini sesuai kondisi pelayanan Anda.' }}</p><label v-if="confirming === 'reject'" class="mt-4">Alasan tidak bisa<textarea v-model="reason" required minlength="3" maxlength="500" rows="3" /></label><p v-if="message" class="error-message" role="alert">{{ message }}</p><div class="modal-actions"><UiButton variant="secondary" :disabled="busy" @click="confirming = ''">Kembali</UiButton><UiButton type="submit" :loading="busy" :disabled="confirming === 'complete' && !canFinishTreatment">Konfirmasi {{ JOB_ACTION_LABELS[confirming]?.toLowerCase() }}</UiButton></div></form></UiModal>
  </div>
</template>
