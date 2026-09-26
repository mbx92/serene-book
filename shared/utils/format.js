import { PAYMENT_METHOD_LABELS } from '../constants/index.js'
export const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0))
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
export const dateLabel = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' }).format(new Date(value)) : '—'
export const timeLabel = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Makassar' }).format(new Date(value)) : '—'
export const initials = (name = '') => name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()

export const humanize = value => String(value || '').toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
export const paymentMethodLabel = value => PAYMENT_METHOD_LABELS[value] || humanize(value)
