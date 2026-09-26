<script setup>
import { money, timeLabel } from '#shared/utils/format.js'
defineProps({ share: Object })
const labels = { PAYMENT_RECEIVED: 'Pembayaran diterima', PAYMENT_REFUNDED: 'Refund', ORDER_COMPLETED: 'Treatment selesai', CANCELLED: 'Order dibatalkan', OPENING_BALANCE: 'Saldo awal' }
</script>
<template>
  <section v-if="share" class="panel form-panel">
    <h2>Pembagian pendapatan</h2>
    <p class="form-hint">{{ share.frozen ? 'Formula order dikunci' : 'Estimasi menggunakan formula saat ini' }} · {{ share.trigger==='ORDER_COMPLETED'?'Setelah treatment selesai':'Saat pembayaran diterima' }}</p>
    <div class="billing-line"><span>Layanan setelah diskon</span><strong>{{ money(share.serviceBase) }}</strong></div>
    <div class="billing-line"><span>Dana layanan diterima</span><strong>{{ money(share.collectedBase) }}</strong></div>
    <div class="billing-total"><span>Sudah dibagi</span><strong>{{ money(share.allocatedBase) }}</strong></div>
    <div v-for="[key,label] in [['owner','Owner'],['admin','Admin'],['therapist','Therapist']]" :key="key" class="billing-line"><span>{{ label }} {{ Number(share[key+'Percent']) }}%</span><strong>{{ money(share[key+'Amount']) }}</strong></div>
    <p v-if="Number(share.collectedBase)>Number(share.allocatedBase)" class="form-hint">Dana menunggu treatment selesai sebelum dibagi.</p>
    <p v-if="Number(share.therapistAmount)>0&&!share.therapistId" class="form-hint">Bagian therapist menunggu penetapan therapist.</p>
    <details v-if="share.events?.length" class="mt-4"><summary class="text-link">Riwayat pembagian</summary><div v-for="event in share.events" :key="event.id" class="payment-history"><div><strong>{{ labels[event.kind]||event.kind }}</strong><small>{{ timeLabel(event.createdAt) }}</small></div><span>{{ money(event.baseDelta) }}</span></div></details>
    <p class="form-hint mt-4">Transport dan pajak terpisah. Angka ini mencatat hak pendapatan, belum merupakan pencairan dana.</p>
  </section>
</template>
