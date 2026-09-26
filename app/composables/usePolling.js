export function usePolling(refresh, interval = 25000) {
 let timer
 onMounted(() => { timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, interval) })
 onBeforeUnmount(() => clearInterval(timer))
}