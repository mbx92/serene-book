export function useAuth() {
  const user = useState('auth-user', () => null)
  const api = useRequestFetch()
  async function refresh() { try { const result = await api('/api/auth/me'); user.value = result.user } catch { user.value = null } }
  async function login(email, password) { const result = await $fetch('/api/auth/login', { method: 'POST', body: { email, password } }); user.value = result.user; await navigateTo(user.value.role === 'THERAPIST' ? '/therapist' : '/dashboard') }
  async function logout() { await $fetch('/api/auth/logout', { method: 'POST' }); user.value = null; clearNuxtData(); await navigateTo('/login') }
  const isOwner = computed(() => ['OWNER','SUPER_ADMIN'].includes(user.value?.role))
  const isOffice = computed(() => ['OWNER','SUPER_ADMIN','CUSTOMER_SERVICE'].includes(user.value?.role))
  const isLocationAdmin = computed(() => user.value?.role === 'LOCATION_ADMIN')
  const canManageOrders = computed(() => ['OWNER','SUPER_ADMIN','CUSTOMER_SERVICE','LOCATION_ADMIN'].includes(user.value?.role))
  const canAssign = computed(() => ['OWNER','SUPER_ADMIN','LOCATION_ADMIN'].includes(user.value?.role))
  return { user, refresh, login, logout, isOwner, isOffice, canAssign, isLocationAdmin, canManageOrders }
}