<script setup>
import { STATUS_LABELS } from '#shared/constants/index.js'
const props = defineProps({ status: String })
const tone = computed(() => ['PAID','CLOSED','ACCEPTED','AVAILABLE','SUCCESS'].includes(props.status) ? 'green' : ['IN_PROGRESS','ON_THE_WAY','ARRIVED'].includes(props.status) ? 'blue' : ['NEW','CONFIRMED','ASSIGNED_LOCATION','ASSIGNED_THERAPIST','PARTIAL','COMPLETED','BOOKED','PENDING'].includes(props.status) ? 'amber' : props.status?.includes('CANCELLED') || ['REJECTED','THERAPIST_REJECTED','NO_THERAPIST_AVAILABLE','FAILED','REFUNDED','EXPIRED'].includes(props.status) ? 'red' : 'gray')
</script><template><span :class="['badge', 'badge-' + tone]"><span class="badge-dot" />{{ STATUS_LABELS[status] || status?.replaceAll('_', ' ') }}</span></template>
