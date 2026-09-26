export function useFeedback() {
 const messages = useState('feedback', () => [])
 function toast(message, type = 'success') { const id = Date.now(); messages.value.push({ id, message, type }); if (import.meta.client) setTimeout(() => messages.value = messages.value.filter(m => m.id !== id), 5000) }
 function error(e) { return e?.data?.data?.message || e?.data?.statusMessage || e.message || 'Terjadi kesalahan' }
 return { messages, toast, error }
}