<script setup>
import { money } from '#shared/utils/format.js'
import { splitRevenue, cents } from '#shared/utils/revenue-sharing.js'
const { data, error } = await useFetch('/api/settings/revenue-sharing')
const { toast, error: formatError } = useFeedback()
const form = reactive({ ownerPercent: Number(data.value?.ownerPercent ?? 10), adminPercent: Number(data.value?.adminPercent ?? 10), therapistPercent: Number(data.value?.therapistPercent ?? 80), trigger: data.value?.trigger || 'PAYMENT_RECEIVED' })
const busy = ref(false), message = ref('')
const total = computed(() => Math.round((Number(form.ownerPercent) + Number(form.adminPercent) + Number(form.therapistPercent)) * 100) / 100)
const example = computed(() => total.value === 100 ? splitRevenue(cents(100000), form) : null)
async function save() {
  busy.value = true; message.value = ''
  try { data.value = await $fetch('/api/settings/revenue-sharing', { method: 'PATCH', body: form }); toast('Pengaturan pembagian pendapatan tersimpan') }
  catch (e) { message.value = formatError(e) }
  finally { busy.value = false }
}
</script>
<template>
  <div>
    <LayoutPageHeader title="Settings" description="Atur identitas aplikasi, tagihan customer, dan pembagian pendapatan layanan." eyebrow="SYSTEM SETTINGS" />
    <SettingsBranding />
    <SettingsBilling />
    <p v-if="error" class="error-message">{{ error.data?.statusMessage }}</p>
    <form v-if="data" class="panel form-panel max-w-3xl" @submit.prevent="save">
      <h2>Pembagian pendapatan</h2>
      <p class="muted mb-5">Dasar pembagian adalah subtotal layanan setelah diskon. Biaya transport dan pajak tidak termasuk.</p>
      <div class="form-grid">
        <label>Owner (%)<input v-model.number="form.ownerPercent" type="number" min="0" max="100" step="0.01" required /></label>
        <label>Admin (%)<input v-model.number="form.adminPercent" type="number" min="0" max="100" step="0.01" required /></label>
        <label>Therapist (%)<input v-model.number="form.therapistPercent" type="number" min="0" max="100" step="0.01" required /></label>
        <label>Waktu pembagian<select v-model="form.trigger"><option value="PAYMENT_RECEIVED">Saat pembayaran diterima</option><option value="ORDER_COMPLETED">Setelah treatment selesai</option></select></label>
      </div>
      <p :class="total===100?'form-hint':'error-message'">Total pembagian: {{ total }}% · wajib tepat 100%.</p>
      <p class="form-hint mb-5">Pembayaran sebagian dibagi secara proporsional terhadap total tagihan. Pilihan setelah treatment selesai menahan pembagian hingga layanan selesai; hanya dana yang sudah diterima yang dibagi. Refund mengurangi bagian setiap pihak.</p>
      <div v-if="example" class="note-box">
        <strong>Contoh layanan bersih {{ money(100000) }}</strong>
        <div class="billing-line"><span>Owner {{ form.ownerPercent }}%</span><strong>{{ money(example.ownerAmount) }}</strong></div>
        <div class="billing-line"><span>Admin {{ form.adminPercent }}%</span><strong>{{ money(example.adminAmount) }}</strong></div>
        <div class="billing-line"><span>Therapist {{ form.therapistPercent }}%</span><strong>{{ money(example.therapistAmount) }}</strong></div>
      </div>
      <p class="form-hint mt-4">Formula dikunci pada pembayaran pertama atau saat treatment selesai. Perubahan berlaku untuk order yang belum memiliki catatan pembagian. Pembagian ini merupakan pencatatan hak pendapatan; pencairan dana dilakukan terpisah.</p>
      <p v-if="message" class="error-message" role="alert">{{ message }}</p>
      <div class="modal-actions"><UiButton type="submit" :loading="busy" :disabled="total!==100">Simpan pengaturan</UiButton></div>
    </form>
  </div>
</template>
