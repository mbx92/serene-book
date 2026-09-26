<script setup>
import { ROLE_LABELS } from '#shared/constants/index.js'
import { initials, dateLabel, today } from '#shared/utils/format.js'
const { user, logout, isOwner, isOffice, isLocationAdmin } = useAuth()
const route = useRoute()
const mobileOpen = ref(false)
const { data: notifications, refresh: refreshNotifications } = useNotifications()
const showNotifications = ref(false)
const nav = computed(() => isLocationAdmin.value ? [
 {to:'/dashboard',label:'Dashboard admin',icon:'dashboard',group:'OPERASIONAL'},
 {to:'/orders',label:'Orders',icon:'orders'},
 {to:'/therapists',label:'Therapists',icon:'therapists'}
] : [
 { to:'/dashboard',label:'Overview',icon:'dashboard',group:'WORKSPACE' },
 { to:'/orders',label:'Orders',icon:'orders' }, { to:'/dispatch',label:'Dispatch',icon:'dispatch' },
 { to:'/customers',label:'Customers',icon:'customers',group:'MANAGEMENT' }, { to:'/therapists',label:'Therapists',icon:'therapists' },
 { to:'/schedules',label:'Schedules',icon:'schedules' },{to:'/locations',label:'Locations',icon:'locations'}, {to:'/services',label:'Services & pricing',icon:'services'},
 ...(!isOffice.value || isOwner.value ? [{to:'/payments',label:'Payments',icon:'payments',group:'INSIGHTS'},{to:'/reports',label:'Reports',icon:'reports'}] : []),
 ...(isOwner.value ? [{to:'/users',label:'Users & roles',icon:'users',group:'ADMINISTRATION'},{to:'/audit',label:'Audit log',icon:'audit'},{to:'/settings',label:'Settings',icon:'settings'}] : [])
])
const unread = computed(() => notifications.value.filter(n => !n.readAt).length)
watch(() => route.path, () => mobileOpen.value = false)
async function readNotification(n) { await $fetch(`/api/notifications/${n.id}`,{method:'PATCH'}); await refreshNotifications(); showNotifications.value = false; if(n.data?.orderId) await navigateTo(`/orders/${n.data.orderId}`) }
async function markAll() { await $fetch('/api/notifications',{method:'PATCH'}); await refreshNotifications() }
</script><template><div class="app-shell"><div v-if="mobileOpen" class="sidebar-overlay" @click="mobileOpen=false" /><aside :class="['sidebar',{open:mobileOpen}]"><NuxtLink to="/dashboard" class="brand"><span class="brand-icon"><UiIcon name="leaf" :size="26" /></span><span>serene<span class="brand-sub">SPA MANAGEMENT</span></span></NuxtLink><div class="workspace-label"><span class="workspace-mark">S</span><div>Serene Wellness<small>Operational workspace</small></div><UiIcon name="right" :size="14" /></div><nav><template v-for="item in nav" :key="item.to"><p v-if="item.group" class="nav-group">{{ item.group }}</p><NuxtLink :to="item.to" :class="['nav-item',{active:route.path.startsWith(item.to)}]"><UiIcon :name="item.icon" :size="19" /><span>{{ item.label }}</span><span v-if="item.to === '/orders'" class="nav-mini">Live</span></NuxtLink></template></nav><div class="sidebar-bottom"><button class="account" @click="logout"><span class="avatar">{{ initials(user?.name) }}</span><span>{{ user?.name }}<small>{{ ROLE_LABELS[user?.role] }}</small></span><UiIcon name="logout" :size="17" /></button></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-toggle" aria-label="Buka navigasi" @click="mobileOpen=true"><UiIcon name="menu" /></button><span>Workspace</span><UiIcon name="right" :size="14" /><strong>{{ nav.find(n => route.path.startsWith(n.to))?.label || 'Overview' }}</strong></div><div class="topbar-actions"><span class="live-dot" /> <span class="live-text">Operasional aktif</span><span class="topbar-divider" /><span class="topbar-date">{{ dateLabel(today()) }}</span><div class="notification-anchor"><button class="icon-button notification-button" aria-label="Notifikasi" @click="showNotifications=!showNotifications"><UiIcon name="notifications" /><span v-if="unread" class="notification-dot" /></button><div v-if="showNotifications" class="notification-panel"><div class="panel-heading"><h3>Notifikasi <span class="count">{{ unread }}</span></h3><button class="text-link" @click="markAll">Tandai dibaca</button></div><button v-for="n in notifications.slice(0,12)" :key="n.id" :class="['notification-item',{unread:!n.readAt}]" @click="readNotification(n)"><strong>{{ n.title }}</strong><span>{{ n.message }}</span></button><p v-if="!notifications.length" class="muted p-6">Belum ada notifikasi.</p></div></div><span class="avatar small">{{ initials(user?.name) }}</span></div></header><main class="main-content"><slot /></main><footer class="app-footer"><span>Serene Spa Management</span><span>Made for a calmer workday <UiIcon name="leaf" :size="12" /></span></footer></div></div></template>