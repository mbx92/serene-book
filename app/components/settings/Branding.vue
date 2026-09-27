<script setup>
import { BRAND_IMAGE_MAX_BYTES, DEFAULT_LOGO, DEFAULT_FAVICON } from '#shared/utils/branding.js'
const branding = useBranding()
const { data, error } = await useFetch('/api/settings/branding')
const { toast, error: formatError } = useFeedback()
const form = reactive({ appName: data.value?.appName || branding.value.appName, logo: data.value?.logo ?? null, favicon: data.value?.favicon ?? null })
const busy = ref(false), reading = ref(0), message = ref('')
async function upload(event, field) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  message.value = ''
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { message.value = 'Gunakan gambar PNG, JPG, atau WebP.'; return }
  if (file.size > BRAND_IMAGE_MAX_BYTES) { message.value = 'Ukuran gambar maksimal 2 MB.'; return }
  reading.value++
  try {
    form[field] = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
  } catch { message.value = 'Gambar tidak dapat dibaca. Silakan pilih kembali.' }
  finally { reading.value-- }
}
async function save() {
  busy.value = true; message.value = ''
  try {
    const saved = await $fetch('/api/settings/branding', { method: 'PATCH', body: form })
    Object.assign(form, { appName: saved.appName, logo: saved.logo, favicon: saved.favicon })
    branding.value = saved.branding
    toast('Nama aplikasi, logo, dan favicon tersimpan')
  } catch (e) { message.value = formatError(e) }
  finally { busy.value = false }
}
</script>
<template>
  <section class="panel form-panel max-w-3xl mb-6">
    <h2>Identitas aplikasi</h2>
    <p class="muted mb-5">Atur nama aplikasi, logo, dan ikon pada tab browser untuk seluruh pengguna.</p>
    <p v-if="error" class="error-message" role="alert">{{ error.data?.statusMessage || 'Pengaturan identitas gagal dimuat. Muat ulang halaman.' }}</p>
    <form v-if="data" @submit.prevent="save">
      <fieldset :disabled="busy" class="branding-fields">
        <label>Nama aplikasi<input v-model="form.appName" required minlength="2" maxlength="80" autocomplete="off" /></label>
        <div class="branding-grid">
          <div><label for="app-logo">Logo aplikasi</label><div class="branding-preview"><img :src="form.logo || DEFAULT_LOGO" alt="Pratinjau logo aplikasi" /></div><input id="app-logo" type="file" accept="image/png,image/jpeg,image/webp" :disabled="!!reading" @change="upload($event, 'logo')" /><button v-if="form.logo" type="button" class="text-link mt-3" @click="form.logo=null">Gunakan logo bawaan</button></div>
          <div><label for="app-favicon">Favicon</label><div class="branding-preview favicon-preview"><img :src="form.favicon || DEFAULT_FAVICON" alt="Pratinjau favicon" /><span>{{ form.appName || 'Nama aplikasi' }}</span></div><input id="app-favicon" type="file" accept="image/png,image/jpeg,image/webp" :disabled="!!reading" @change="upload($event, 'favicon')" /><div class="branding-image-actions"><button type="button" class="text-link" @click="form.favicon=form.logo">Gunakan logo sebagai favicon</button><button v-if="form.favicon" type="button" class="text-link" @click="form.favicon=null">Gunakan favicon bawaan</button></div></div>
        </div>
        <p class="form-hint mt-4">PNG, JPG, atau WebP, maksimal 2 MB per gambar. Gunakan gambar persegi agar ikon terlihat jelas. Perubahan diterapkan setelah disimpan.</p>
      </fieldset>
      <p v-if="message" class="error-message" role="alert">{{ message }}</p>
      <div class="modal-actions"><UiButton type="submit" :loading="busy" :disabled="!!reading">Simpan identitas aplikasi</UiButton></div>
    </form>
  </section>
</template>
<style scoped>
.branding-fields { border:0; padding:0; margin:0; min-width:0; }
.branding-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; margin-top:20px; }
.branding-preview { display:flex; align-items:center; justify-content:center; height:120px; padding:16px; margin:10px 0 14px; border:1px solid var(--border); border-radius:10px; background:#faf9f5; }
.branding-preview img { width:88px; height:88px; object-fit:contain; }
.favicon-preview { gap:12px; justify-content:flex-start; }
.favicon-preview img { width:32px; height:32px; flex-shrink:0; }
.favicon-preview span { overflow-wrap:anywhere; font-size:12px; }
.branding-image-actions { display:flex; flex-direction:column; align-items:flex-start; gap:12px; margin-top:12px; }
input[type=file] { max-width:100%; font-size:11px; }
@media(max-width:600px) { .branding-grid { grid-template-columns:1fr; } }
</style>
