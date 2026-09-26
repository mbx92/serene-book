<script setup>
const { data, error } = await useFetch('/api/settings/billing')
const { toast, error: formatError } = useFeedback()
const form = reactive({ transportEnabled: data.value?.transportEnabled ?? true, taxEnabled: data.value?.taxEnabled ?? true })
const busy = ref(false), message = ref('')
async function save() {
  busy.value = true; message.value = ''
  try { data.value = await $fetch('/api/settings/billing', { method: 'PATCH', body: form }); toast('Pengaturan transport dan pajak tersimpan') }
  catch (e) { message.value = formatError(e) }
  finally { busy.value = false }
}
</script>
<template>
  <form class="panel form-panel max-w-3xl mb-5" @submit.prevent="save">
    <h2>Transport dan pajak</h2>
    <p class="muted mb-5">Tentukan biaya tambahan yang digunakan pada tagihan customer.</p>
    <label class="billing-toggle-row">
      <span>Aktifkan biaya transport</span>
      <span class="billing-toggle-control">
        <span class="billing-toggle-status" aria-hidden="true">{{ form.transportEnabled?'Aktif':'Nonaktif' }}</span>
        <span class="billing-toggle">
          <input v-model="form.transportEnabled" type="checkbox" role="switch" :disabled="!data||busy" />
          <span class="billing-toggle-track" aria-hidden="true" />
        </span>
      </span>
    </label>
    <label class="billing-toggle-row">
      <span>Aktifkan pajak</span>
      <span class="billing-toggle-control">
        <span class="billing-toggle-status" aria-hidden="true">{{ form.taxEnabled?'Aktif':'Nonaktif' }}</span>
        <span class="billing-toggle">
          <input v-model="form.taxEnabled" type="checkbox" role="switch" :disabled="!data||busy" />
          <span class="billing-toggle-track" aria-hidden="true" />
        </span>
      </span>
    </label>
    <p class="form-hint">Biaya yang dinonaktifkan tidak ditampilkan pada form order dan bernilai nol saat order disimpan. Tagihan yang sudah tersimpan tetap mengikuti rincian historinya. Transport dan pajak tidak termasuk pembagian pendapatan.</p>
    <p v-if="error||message" class="error-message" role="alert">{{ message||error?.data?.statusMessage }}</p>
    <div class="modal-actions"><UiButton type="submit" :loading="busy" :disabled="!data">Simpan transport dan pajak</UiButton></div>
  </form>
</template>
<style scoped>
.billing-toggle-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin:0; padding:14px 0; cursor:pointer; }
.billing-toggle-control { display:flex; align-items:center; gap:12px; flex-shrink:0; }
.billing-toggle-status { color:#64735c; font-size:11px; font-weight:400; }
.billing-toggle { display:inline-flex; position:relative; align-items:center; width:44px; height:44px; }
.billing-toggle input { position:absolute; inset:0; width:44px; height:44px; min-height:0; padding:0; margin:0; opacity:0; cursor:pointer; z-index:1; }
.billing-toggle-track { display:block; width:44px; height:24px; border-radius:12px; background:#c7cfc1; transition:background .18s; }
.billing-toggle-track::after { content:''; display:block; width:18px; height:18px; margin:3px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #0002; transition:transform .18s; }
.billing-toggle input:checked + .billing-toggle-track { background:#315b49; }
.billing-toggle input:checked + .billing-toggle-track::after { transform:translateX(20px); }
.billing-toggle input:focus-visible + .billing-toggle-track { outline:2px solid #315b49; outline-offset:3px; }
.billing-toggle input:disabled { cursor:not-allowed; }
.billing-toggle input:disabled + .billing-toggle-track { opacity:.5; }
@media (prefers-reduced-motion:reduce) { .billing-toggle-track,.billing-toggle-track::after { transition:none; } }
</style>
