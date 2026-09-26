import { countdownLabel } from '#shared/utils/treatment.js'
export function useTreatmentCountdown(source, refresh) {
  const remainingSeconds = ref(null)
  let serverTime, receivedAt, timer
  function tick() {
    const timing = toValue(source)
    const end = timing?.endsAt ? new Date(timing.endsAt).getTime() : NaN
    const now = serverTime + (import.meta.client ? performance.now() - receivedAt : 0)
    remainingSeconds.value = Number.isFinite(end) && Number.isFinite(now) ? Math.max(0, Math.ceil((end - now) / 1000)) : null
  }
  watch(() => toValue(source), timing => {
    serverTime = timing?.serverNow ? new Date(timing.serverNow).getTime() : NaN
    receivedAt = import.meta.client ? performance.now() : 0
    tick()
  }, { immediate: true })
  async function resume() {
    if (document.visibilityState === 'visible') { tick(); await refresh?.() }
  }
  onMounted(() => { timer = setInterval(tick, 250); document.addEventListener('visibilitychange', resume) })
  onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', resume) })
  return { remainingSeconds, countdown: computed(() => countdownLabel(remainingSeconds.value)), canComplete: computed(() => remainingSeconds.value === 0) }
}
