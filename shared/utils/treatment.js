export function treatmentWindow(startedAt, durationMinutes, now = Date.now()) {
  const start = startedAt ? new Date(startedAt).getTime() : NaN
  const current = new Date(now).getTime()
  const duration = Number(durationMinutes)
  if (!Number.isFinite(start) || !Number.isFinite(current) || !Number.isInteger(duration) || duration <= 0) return { startedAt: null, endsAt: null, durationMinutes: duration, remainingSeconds: null, canComplete: false }
  const end = start + duration * 60000
  const remainingSeconds = Math.max(0, Math.ceil((end - current) / 1000))
  return { startedAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), durationMinutes: duration, remainingSeconds, canComplete: remainingSeconds === 0 }
}
export function countdownLabel(seconds) {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.max(0, Math.ceil(seconds))
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60].map(n => String(n).padStart(2, '0')).join(':')
}
