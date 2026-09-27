<script setup>
const branding = useBranding()
import { initials } from '#shared/utils/format.js'
const { user, logout } = useAuth()
const route = useRoute()
</script><template><div class="therapist-shell"><header class="therapist-header"><NuxtLink to="/therapist" class="brand"><LayoutBrand /></NuxtLink><button class="icon-button" aria-label="Keluar" @click="logout"><UiIcon name="logout" /></button></header><main><slot /></main><nav class="mobile-bottom-nav"><NuxtLink to="/therapist" :class="{active:route.path === '/therapist' || route.path.startsWith('/therapist/jobs')}"><UiIcon name="orders" />Job saya</NuxtLink><NuxtLink to="/therapist/history" :class="{active:route.path === '/therapist/history'}"><UiIcon name="clock" />Histori</NuxtLink><NuxtLink to="/therapist/profile" :class="{active:route.path === '/therapist/profile'}"><UiIcon name="customers" />Profil</NuxtLink></nav></div></template>