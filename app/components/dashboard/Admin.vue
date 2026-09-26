<script setup>
import { initials } from '#shared/utils/format.js'
const props=defineProps({data:Object,date:String,error:Object,status:String})
defineEmits(['update-date','refresh'])
const metrics=computed(()=>props.data?.metrics||{})
const cards=computed(()=>[{label:'Orders hari ini',value:metrics.value.ordersToday||0,icon:'orders'},{label:'Menunggu assignment',value:metrics.value.waitingAssignment||0,icon:'dispatch'},{label:'Treatment aktif',value:metrics.value.activeJobs||0,icon:'services'},{label:'Therapist tersedia',value:metrics.value.availableTherapists||0,icon:'therapists'}])
const waiting=computed(()=>(props.data?.orders||[]).filter(o=>['NEW','CONFIRMED','ASSIGNED_LOCATION','ASSIGNED_THERAPIST','THERAPIST_REJECTED','NO_THERAPIST_AVAILABLE'].includes(o.orderStatus)))
const active=computed(()=>(props.data?.orders||[]).filter(o=>['ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS'].includes(o.orderStatus)))
</script>
<template>
  <div>
    <LayoutPageHeader title="Dashboard admin" description="Pantau order dan tim therapist di lokasi Anda." eyebrow="OPERASIONAL LOKASI">
      <input :value="date" type="date" aria-label="Tanggal dashboard" @input="$emit('update-date',$event.target.value)" />
      <UiButton to="/orders/new"><UiIcon name="plus" :size="17" />Buat order</UiButton>
    </LayoutPageHeader>
    <p v-if="error" class="error-message">Dashboard gagal dimuat. <button class="text-link" @click="$emit('refresh')">Coba lagi</button></p>
    <div class="metrics-grid"><div v-for="card in cards" :key="card.label" class="metric-card"><div class="metric-top"><span>{{ card.label }}</span><span class="metric-icon green"><UiIcon :name="card.icon" :size="19" /></span></div><strong class="metric-value">{{ card.value }}</strong><p>Jadwal pada tanggal yang dipilih</p></div></div>
    <div class="note-box mb-5">{{ metrics.waitingResponse||0 }} penawaran menunggu respons therapist · {{ metrics.inProgress||0 }} treatment berjalan · {{ metrics.completed||0 }} treatment selesai.</div>
    <section class="panel mb-5"><div class="panel-heading"><div><h2>Perlu ditangani <span class="count">{{ waiting.length }}</span></h2><p class="muted">Konfirmasi booking, tetapkan therapist, dan tindak lanjuti penawaran.</p></div><UiButton to="/dispatch" variant="secondary">Atur assignment</UiButton></div><OrderTable :orders="waiting" hide-price /><div class="panel-footer"><span>Diperbarui otomatis setiap 25 detik</span><button class="text-link" :disabled="status==='pending'" @click="$emit('refresh')"><UiIcon name="refresh" :size="14" />Refresh</button></div></section>
    <section class="panel mb-5"><div class="panel-heading"><h2>Treatment aktif <span class="count">{{ active.length }}</span></h2><NuxtLink to="/orders" class="text-link">Lihat orders</NuxtLink></div><OrderTable :orders="active" hide-price /></section>
    <section class="panel"><div class="panel-heading"><div><h2>Tim therapist</h2><p class="muted">Jadwal kerja dan penugasan untuk hari yang dipilih.</p></div><UiButton to="/therapists" variant="secondary">Kelola therapist</UiButton></div><div class="table-wrap"><table><thead><tr><th>Therapist</th><th>Lokasi</th><th>Jam kerja</th><th>Job aktif</th><th>Status</th></tr></thead><tbody><tr v-for="t in data?.therapists||[]" :key="t.id"><td><NuxtLink :to="'/therapists/'+t.id" class="customer-cell"><span class="avatar pastel">{{ initials(t.name) }}</span><strong>{{ t.name }}</strong></NuxtLink></td><td>{{ t.locations.map(l=>l.name).join(', ') }}</td><td>{{ t.startTime?.slice(0,5)||'—' }} – {{ t.endTime?.slice(0,5)||'—' }}</td><td>{{ t.activeJobs }}</td><td><UiBadge :status="t.availability" /></td></tr></tbody></table><UiEmptyState v-if="!data?.therapists?.length" title="Belum ada therapist" message="Tambahkan therapist untuk lokasi Anda." /></div></section>
  </div>
</template>
