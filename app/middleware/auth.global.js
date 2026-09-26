import { locationAdminPageAllowed } from '#shared/utils/access.js'
export default defineNuxtRouteMiddleware(async to => {
 if (['/','/book'].includes(to.path) || to.path.startsWith('/job/')) return
 const { user, refresh } = useAuth()
 if (!user.value) await refresh()
 if (!user.value && to.path !== '/login') return navigateTo('/login')
 if (user.value && to.path === '/login') return navigateTo(user.value.role === 'THERAPIST' ? '/therapist' : '/dashboard')
 if (user.value?.role === 'THERAPIST' && !(to.path === '/therapist' || to.path.startsWith('/therapist/')) && to.path !== '/logout') return navigateTo('/therapist')
 if (user.value && user.value.role !== 'THERAPIST' && (to.path === '/therapist' || to.path.startsWith('/therapist/'))) return navigateTo('/dashboard')
 if (user.value && !['OWNER','SUPER_ADMIN'].includes(user.value.role) && ['/users','/audit','/settings'].some(p => to.path.startsWith(p))) return navigateTo('/dashboard')
 if (user.value?.role === 'LOCATION_ADMIN' && !locationAdminPageAllowed(to.path)) return navigateTo('/dashboard')
 if (user.value?.role === 'CUSTOMER_SERVICE' && ['/payments','/reports'].some(p => to.path.startsWith(p))) return navigateTo('/dashboard')
})
