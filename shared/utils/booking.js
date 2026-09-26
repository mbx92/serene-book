import { DateTime } from 'luxon'
export function slot(date, time, minutes, timezone = 'Asia/Makassar') {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: timezone })
  if (!start.isValid || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Waktu booking atau durasi tidak valid')
  return { start: start.toJSDate(), end: start.plus({ minutes }).toJSDate() }
}
export const overlaps = (a, b) => a.start < b.end && a.end > b.start
export function withinSchedule(order, schedule, timezone) {
  if (schedule.status !== 'AVAILABLE') return false
  const start = DateTime.fromISO(`${schedule.scheduleDate}T${schedule.startTime}`, { zone: timezone }).toJSDate()
  const end = DateTime.fromISO(`${schedule.scheduleDate}T${schedule.endTime}`, { zone: timezone }).toJSDate()
  return new Date(order.bookingStartsAt) >= start && new Date(order.bookingEndsAt) <= end
}
