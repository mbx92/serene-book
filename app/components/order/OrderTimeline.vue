<script setup>
import { STATUS_LABELS } from '#shared/constants/index.js'
import { timeLabel } from '#shared/utils/format.js'
defineProps({ logs: Array })
</script><template><div class="timeline"><div v-for="(log,i) in logs" :key="log.id" class="timeline-item"><span :class="['timeline-dot',{latest:i===logs.length-1}]"><UiIcon name="check" :size="12" /></span><div><strong>{{ STATUS_LABELS[log.toStatus] || log.toStatus }}</strong><p v-if="log.notes">{{ log.notes }}</p><small>{{ log.actorName || 'Booking form' }} · {{ timeLabel(log.createdAt) }}</small></div></div></div></template>