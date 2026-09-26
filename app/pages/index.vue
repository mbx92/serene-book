<script setup>
import { money } from '#shared/utils/format.js'
definePageMeta({ layout: false })
useSeoMeta({ title: 'Serene — Spa & Home Service', description: 'Temukan layanan spa, durasi treatment, dan harga Serene. Booking treatment untuk rumah, hotel, atau villa Anda.' })
const { data: catalog, error, refresh, status } = await useFetch('/api/public/catalog')
const locationId = ref(null)
const locations = computed(() => catalog.value?.locations || [])
const services = computed(() => (catalog.value?.services || []).map(service => {
  const defaultPrice = service.prices.find(p => p.locationId === null)
  const effectivePrices = locationId.value === null
    ? (locations.value.length ? locations.value.map(location => service.prices.find(p => p.locationId === location.id) || defaultPrice) : [defaultPrice])
    : [service.prices.find(p => p.locationId === locationId.value) || defaultPrice]
  const amounts = effectivePrices.filter(Boolean).map(p => Number(p.price)).filter(p => Number.isFinite(p) && p >= 0)
  return { ...service, amount: amounts.length ? Math.min(...amounts) : null, variable: new Set(amounts).size > 1 }
}))
const bookingLink = service => ({ path: '/book', query: { service: service.id, ...(locationId.value === null ? {} : { location: locationId.value }) } })
</script>
<template>
  <div class="landing">
    <header class="landing-header landing-container">
      <NuxtLink to="/" class="brand" aria-label="Serene beranda"><span class="brand-icon"><UiIcon name="leaf" :size="24" /></span><span>serene<span class="brand-sub">SPA & HOME SERVICE</span></span></NuxtLink>
      <nav aria-label="Navigasi utama"><a href="#layanan">Layanan & harga</a><a href="#cara-booking">Cara booking</a><a href="/dokumentasi.html">Panduan</a><NuxtLink to="/login" class="staff-link">Staff login <UiIcon name="up" :size="14" /></NuxtLink></nav>
      <NuxtLink to="/book" class="btn btn-primary">Booking treatment <UiIcon name="arrow" :size="16" /></NuxtLink>
    </header>
    <main>
      <section class="landing-hero landing-container">
        <div class="hero-copy">
          <p class="landing-eyebrow">A LITTLE TIME FOR YOURSELF</p>
          <h1>Berhenti sejenak.<br />Kembali <em>seimbang.</em></h1>
          <p class="hero-description">Hadirkan pengalaman spa di kenyamanan rumah, hotel, atau villa Anda. Pilih treatment, tentukan waktu, dan biarkan tim kami membantu mengatur sisanya.</p>
          <div class="hero-actions"><a href="#layanan" class="btn btn-primary">Temukan treatment <UiIcon name="arrow" :size="17" /></a><NuxtLink to="/book" class="hero-secondary">Booking sekarang</NuxtLink></div>
          <div class="hero-detail"><UiIcon name="locations" :size="18" /><span>Di tempat pilihan Anda</span><span class="detail-dot" /><span>Konfirmasi melalui WhatsApp</span></div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="art-orbit" /><div class="art-disc" />
          <svg class="art-branch" viewBox="0 0 300 440" fill="none"><path d="M145 430C135 320 175 205 170 30" stroke="currentColor" stroke-width="3" /><path d="M159 335C70 333 38 294 48 230C109 238 148 268 159 335ZM165 267C245 256 272 217 258 166C208 175 169 220 165 267ZM173 199C100 188 72 147 82 103C130 116 164 155 173 199ZM174 129C224 109 239 73 222 33C188 51 176 81 174 129Z" fill="currentColor" /></svg>
          <div class="art-stone stone-one" /><div class="art-stone stone-two" /><div class="art-stone stone-three" />
          <span class="art-caption">UNWIND. RESTORE. RECONNECT.</span><span class="art-mark">s.</span>
        </div>
      </section>
      <section id="layanan" class="landing-services">
        <div class="landing-container">
          <div class="services-heading"><div><p class="landing-eyebrow">THE TREATMENT MENU</p><h2>Layanan untuk waktu tenang Anda.</h2><p>Pilih treatment yang sesuai, dengan durasi dan harga yang jelas.</p></div><label class="area-filter">Area pelayanan<select v-model="locationId" aria-label="Area pelayanan"><option :value="null">Semua area</option><option v-for="location in locations" :key="location.id" :value="location.id">{{ location.name }}</option></select></label></div>
          <div v-if="error" class="landing-empty" role="alert"><p>Layanan belum dapat dimuat. Silakan coba kembali.</p><button type="button" class="btn btn-secondary" :disabled="status==='pending'" @click="refresh()">Coba lagi</button></div>
          <p v-else-if="!services.length" class="landing-empty">Layanan belum tersedia. Silakan kembali lagi nanti.</p>
          <div v-else class="landing-service-grid">
            <article v-for="(service,index) in services" :key="service.id" class="treatment-card">
              <div class="treatment-top"><span class="treatment-icon"><UiIcon :name="index%2?'leaf':'services'" :size="25" /></span><span class="treatment-duration"><UiIcon name="clock" :size="14" />{{ service.durationMinutes }} menit</span></div>
              <h3>{{ service.name }}</h3><p class="treatment-description">{{ service.description || 'Luangkan waktu untuk merawat diri dengan treatment pilihan Anda.' }}</p>
              <div class="treatment-price"><span>{{ service.amount===null?'Harga belum tersedia':service.variable?'Mulai dari':'Harga layanan' }}</span><strong v-if="service.amount!==null">{{ money(service.amount) }}</strong></div>
              <NuxtLink v-if="service.amount!==null" :to="bookingLink(service)" class="treatment-book">Pilih treatment <UiIcon name="arrow" :size="17" /></NuxtLink>
              <p v-else class="treatment-unavailable">Booking tersedia setelah harga ditetapkan.</p>
            </article>
          </div>
          <div class="pricing-note"><UiIcon name="help" :size="18" /><p>Harga mengikuti area pelayanan yang dipilih. <template v-if="catalog?.billing?.transportEnabled">Biaya transport dikonfirmasi terpisah. </template><template v-if="catalog?.billing?.taxEnabled">Pajak yang berlaku dikonfirmasi oleh tim. </template>Jadwal dan ketersediaan therapist dikonfirmasi sebelum treatment.</p></div>
        </div>
      </section>
      <section id="cara-booking" class="booking-steps landing-container">
        <div class="steps-heading"><p class="landing-eyebrow">MAKE ROOM FOR WELLNESS</p><h2>Dari pilihan Anda,<br />ke tempat Anda.</h2><p>Booking langsung tanpa membuat akun.</p></div>
        <ol><li><span>01</span><div><h3>Pilih treatment</h3><p>Temukan layanan, durasi, dan harga yang sesuai dengan kebutuhan Anda.</p></div></li><li><span>02</span><div><h3>Tentukan waktu & lokasi</h3><p>Isi jadwal, alamat, dan pin lokasi agar therapist mudah menemukan Anda.</p></div></li><li><span>03</span><div><h3>Terima konfirmasi</h3><p>Tim kami menghubungi WhatsApp Anda untuk memastikan jadwal dan therapist.</p></div></li></ol>
      </section>
      <section class="landing-cta landing-container"><UiIcon name="leaf" :size="35" /><h2>Waktu untuk Anda,<br /><em>dimulai di sini.</em></h2><NuxtLink to="/book" class="btn btn-primary">Booking treatment <UiIcon name="arrow" :size="17" /></NuxtLink></section>
    </main>
    <footer class="landing-footer landing-container"><div><NuxtLink to="/" class="footer-brand">serene</NuxtLink><p>Spa & home service, di tempat pilihan Anda.</p></div><div class="footer-areas"><span>Area pelayanan</span><p>{{ locations.map(location=>location.name).join(' · ') || 'Area dikonfirmasi oleh tim' }}</p></div><NuxtLink to="/login">Staff login <UiIcon name="up" :size="14" /></NuxtLink></footer>
  </div>
</template>
<style scoped>
.landing { background:#faf9f5; color:#293f34; }
.landing-container { width:min(1160px,calc(100% - 64px)); margin-inline:auto; }
.landing-header { display:flex; align-items:center; justify-content:space-between; gap:24px; padding-block:28px; }
.landing-header .brand { padding:0; }.landing-header nav { display:flex; gap:28px; align-items:center; font-size:12px; color:#647064; }.staff-link { display:inline-flex; align-items:center; gap:5px; }.landing-header .btn { font-size:12px; }
.landing-hero { display:grid; grid-template-columns:1.15fr 1fr; align-items:center; gap:64px; padding-block:56px 88px; }
.landing-eyebrow { font-size:10px; font-weight:600; letter-spacing:2px; color:#7d8873; margin-bottom:20px; }
.hero-copy h1 { font-family:Georgia,serif; font-size:clamp(44px,5.2vw,67px); font-weight:400; letter-spacing:-2.5px; line-height:1.1; }.hero-copy em,.landing-cta em { color:#74866c; font-weight:400; }
.hero-description { font-size:14px; line-height:1.9; color:#748073; max-width:430px; margin-top:26px; }.hero-actions { display:flex; align-items:center; gap:24px; margin-top:32px; }.hero-secondary { font-size:12px; text-decoration:underline; text-underline-offset:5px; }.hero-detail { display:flex; flex-wrap:wrap; align-items:center; gap:9px; color:#7a8574; font-size:10px; margin-top:36px; }.detail-dot { width:3px; height:3px; border-radius:50%; background:#9aa58d; margin-inline:4px; }
.hero-art { position:relative; height:440px; background:#e7eadd; border-radius:180px 180px 16px 16px; overflow:hidden; }.art-orbit { position:absolute; width:320px; height:320px; border:1px solid #bbc5af; border-radius:50%; left:18%; top:15%; }.art-disc { position:absolute; width:215px; height:215px; border-radius:50%; background:#d9cbb6; left:-44px; bottom:56px; }.art-branch { position:absolute; width:270px; height:390px; right:12px; top:-14px; color:#72866c; transform:rotate(15deg); }.art-stone { position:absolute; border-radius:50%; background:linear-gradient(155deg,#bdb6a4,#7e8270); box-shadow:0 14px 25px #3e4b3720; }.stone-one { width:186px; height:61px; left:21%; bottom:72px; transform:rotate(-6deg); }.stone-two { width:148px; height:61px; left:26%; bottom:112px; background:linear-gradient(155deg,#e4ddcb,#a5a38f); transform:rotate(5deg); }.stone-three { width:99px; height:52px; left:31%; bottom:157px; background:linear-gradient(155deg,#c2c3b4,#929a84); transform:rotate(-9deg); }.art-caption { position:absolute; left:28px; bottom:25px; color:#72806a; font-size:9px; letter-spacing:2px; }.art-mark { position:absolute; bottom:14px; right:28px; font-family:Georgia,serif; font-size:60px; color:#aab69b; }
.landing-services { background:#f0f2e9; padding-block:70px; scroll-margin-top:24px; }.services-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:32px; margin-bottom:32px; }.landing h2 { font-family:Georgia,serif; font-weight:400; font-size:34px; letter-spacing:-1px; line-height:1.25; }.services-heading p:last-child { color:#7d8776; line-height:1.7; margin-top:14px; font-size:12px; }.area-filter { display:flex; flex-direction:column; gap:8px; font-size:10px; color:#74816b; min-width:190px; }.area-filter select { width:100%; background:#fafbf7; border:1px solid #d6decc; color:#344c3b; padding:11px 12px; border-radius:7px; font-size:12px; }
.landing-service-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; }.treatment-card { display:flex; flex-direction:column; padding:28px; border:1px solid #e0e5d8; border-radius:12px; background:#fafbf7; }.treatment-top { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:27px; }.treatment-icon { display:grid; place-items:center; width:49px; height:49px; border-radius:50%; background:#eef0e5; color:#78906a; }.treatment-duration { display:flex; align-items:center; gap:6px; color:#7e8c73; font-size:10px; }.treatment-card h3 { font-family:Georgia,serif; font-size:24px; font-weight:400; line-height:1.3; }.treatment-description { font-size:12px; color:#7d8874; line-height:1.8; margin-top:12px; margin-bottom:26px; overflow-wrap:anywhere; }.treatment-price { margin-top:auto; display:flex; flex-direction:column; gap:7px; padding-bottom:22px; }.treatment-price span { font-size:10px; color:#87907d; }.treatment-price strong { font-size:23px; letter-spacing:-.5px; font-weight:500; }.treatment-book { display:flex; align-items:center; justify-content:space-between; gap:8px; border-top:1px solid #e4e8dc; padding-top:18px; font-size:12px; color:#315b49; font-weight:500; }.treatment-book:hover { color:#67835e; }.treatment-unavailable { padding-top:18px; border-top:1px solid #e4e8dc; font-size:11px; color:#87907d; }.pricing-note { display:flex; gap:10px; color:#7b8673; margin-top:25px; }.pricing-note svg { flex-shrink:0; margin-top:2px; }.pricing-note p { font-size:11px; line-height:1.8; }.landing-empty { padding:36px; background:#fafbf7; border-radius:12px; color:#73816c; }.landing-empty .btn { margin-top:16px; }
.booking-steps { display:grid; grid-template-columns:1fr 1fr; gap:90px; padding-block:85px; scroll-margin-top:24px; }.steps-heading>p:last-child { color:#7d8874; font-size:12px; margin-top:19px; }.booking-steps ol { list-style:none; padding:0; margin:0; display:grid; gap:27px; }.booking-steps li { display:flex; gap:22px; }.booking-steps li>span { font-family:Georgia,serif; font-size:24px; color:#a6b298; }.booking-steps h3 { font-size:13px; font-weight:500; margin-bottom:8px; }.booking-steps li p { color:#7c8774; font-size:12px; line-height:1.8; }
.landing-cta { text-align:center; border-radius:16px; background:#e9eddf; padding:48px 24px; }.landing-cta>svg { color:#859d75; margin-inline:auto; margin-bottom:20px; }.landing-cta h2 { font-size:38px; margin-bottom:27px; }.landing-footer { display:flex; justify-content:space-between; align-items:center; gap:32px; padding-block:50px 35px; }.footer-brand { font-family:Georgia,serif; font-size:32px; letter-spacing:-1.5px; }.landing-footer p { font-size:10px; color:#909887; margin-top:8px; line-height:1.8; }.footer-areas { max-width:350px; }.footer-areas>span { font-size:10px; font-weight:500; }.landing-footer>a { display:flex; gap:5px; align-items:center; font-size:11px; }
@media(max-width:1000px) { .landing-header nav { gap:15px; }.landing-header nav .staff-link { display:none; }.landing-hero { gap:32px; }.hero-art { height:390px; }.landing-service-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.booking-steps { gap:45px; } }
@media(max-width:700px) { .landing-container { width:calc(100% - 40px); }.landing-header { gap:14px; padding-block:22px; flex-wrap:wrap; }.landing-header .brand { font-size:29px; }.landing-header>.btn { font-size:10px; padding:10px 12px; }.landing-header nav { width:100%; order:3; padding-top:8px; gap:24px; font-size:11px; }.landing-header nav .staff-link { display:inline-flex; margin-left:auto; }.landing-hero { grid-template-columns:1fr; padding-block:28px 45px; gap:35px; }.hero-copy h1 { font-size:47px; }.hero-description { font-size:13px; }.hero-actions { gap:18px; }.hero-actions .btn { font-size:12px; }.hero-detail { margin-top:26px; font-size:9px; }.hero-art { height:320px; max-width:420px; width:100%; margin-inline:auto; border-radius:150px 150px 12px 12px; }.art-branch { height:290px; width:220px; }.art-orbit { width:250px; height:250px; }.art-disc { width:180px; height:180px; }.stone-one { bottom:53px; }.stone-two { bottom:94px; }.stone-three { bottom:139px; }.landing-services { padding-block:42px; }.services-heading { flex-direction:column; align-items:stretch; gap:22px; }.landing h2 { font-size:29px; }.area-filter { width:100%; }.landing-service-grid { grid-template-columns:1fr; gap:16px; }.treatment-card { padding:24px; }.booking-steps { grid-template-columns:1fr; gap:30px; padding-block:48px; }.landing-cta { padding:35px 20px; }.landing-cta h2 { font-size:34px; }.landing-footer { flex-wrap:wrap; gap:24px; padding-block:35px; }.footer-areas { width:100%; order:3; } }
</style>
