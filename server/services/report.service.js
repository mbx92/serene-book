import { eq, and, inArray, desc } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { listOrders, orderScope } from '../repositories/order.repository.js'
import { listMaster } from '../repositories/master.repository.js'
import { availability } from './order.service.js'
import { permit, ADMIN_ROLES, OWNER_ROLES } from '../utils/auth.js'
export async function paymentList(user) {
  permit(user, OWNER_ROLES)
  return db.select({ payment: s.payments, orderNumber: s.orders.orderNumber, customerName: s.customers.name, locationName: s.locations.name }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).innerJoin(s.customers, eq(s.customers.id, s.orders.customerId)).leftJoin(s.locations, eq(s.locations.id, s.orders.locationId)).where(orderScope(user)).orderBy(desc(s.payments.id)).then(rows => rows.map(r => ({ ...r.payment, orderNumber: r.orderNumber, customerName: r.customerName, locationName: r.locationName })))
}
export async function report(user, filters = {}) {
  permit(user, OWNER_ROLES)
  const orders = await listOrders(user, filters)
  const ids = orders.map(o => o.id)
  const payments = ids.length ? await db.select().from(s.payments).where(inArray(s.payments.orderId, ids)) : []
  const shares = ids.length ? await db.select().from(s.orderRevenueShares).where(inArray(s.orderRevenueShares.orderId, ids)) : []
  const shareSum = key => shares.reduce((n, row) => n + Number(row[key]), 0)
  const paid = payments.filter(p => p.status === 'SUCCESS').reduce((n,p) => n + Number(p.amount), 0)
  const refund = payments.filter(p => p.status === 'REFUNDED').reduce((n,p) => n + Number(p.amount), 0)
  const transactions = orders.filter(o => ['COMPLETED', 'PAID', 'CLOSED'].includes(o.orderStatus))
  const sum = key => transactions.reduce((n,o) => n + Number(o[key]), 0)
  const therapists = await listMaster('therapists', user)
  const assignments = ids.length ? await db.select().from(s.orderAssignments).where(inArray(s.orderAssignments.orderId, ids)) : []
  const therapistStats = therapists.map(t => {
    const jobs = assignments.filter(a => a.therapistId === t.id)
    const completed = jobs.filter(a => a.acceptedAt && orders.some(o => o.id === a.orderId && ['COMPLETED', 'PAID', 'CLOSED'].includes(o.orderStatus)) && a.isActive)
    return { id: t.id, name: t.name, commission: shares.filter(row => row.therapistId === t.id).reduce((n, row) => n + Number(row.therapistAmount), 0), assigned: jobs.length, accepted: jobs.filter(a => a.acceptedAt).length, rejected: jobs.filter(a => a.rejectedAt).length, completed: completed.length, hours: completed.reduce((n,a) => n + orders.find(o => o.id === a.orderId).items.reduce((m,i) => m + i.durationMinutes * i.qty / 60, 0), 0), revenue: completed.reduce((n,a) => n + Number(orders.find(o => o.id === a.orderId).total), 0) }
  })
  const schedules = await listMaster('schedules', user)
  const locations = (await listMaster('locations', user)).map(l => {
    const rows = orders.filter(o => o.locationId === l.id); const completed = rows.filter(o => ['COMPLETED', 'PAID', 'CLOSED'].includes(o.orderStatus))
    const revenue = payments.filter(p => p.status === 'SUCCESS' && rows.some(o => o.id === p.orderId)).reduce((n,p) => n + Number(p.amount), 0)
    const hours = completed.reduce((n,o) => n + o.items.reduce((m,i) => m + i.durationMinutes * i.qty / 60, 0), 0)
    const scheduledHours = schedules.filter(sc => sc.locationId === l.id && sc.status === 'AVAILABLE' && (!filters.from || sc.scheduleDate >= filters.from) && (!filters.to || sc.scheduleDate <= filters.to)).reduce((n,sc) => { const [eh,em] = sc.endTime.split(':').map(Number); const [sh,sm] = sc.startTime.split(':').map(Number); return n + (eh * 60 + em - sh * 60 - sm) / 60 }, 0)
    return { id: l.id, name: l.name, orders: rows.length, completed: completed.length, cancelled: rows.filter(o => o.orderStatus.startsWith('CANCELLED')).length, revenue, average: completed.length ? completed.reduce((n,o) => n + Number(o.total), 0) / completed.length : 0, utilization: scheduledHours ? hours / scheduledHours * 100 : 0 }
  })
  return { orders: orders.map(order => ({ ...order, revenueShare: shares.find(row => row.orderId === order.id) || null })), locations, therapists: therapistStats, summary: { ownerShare: shareSum('ownerAmount'), adminShare: shareSum('adminAmount'), therapistShare: shareSum('therapistAmount'), allocatedBase: shareSum('allocatedBase'), pendingShare: shareSum('collectedBase') - shareSum('allocatedBase'), grossRevenue: sum('subtotal'), discount: sum('discount'), transportFee: sum('transportFee'), tax: sum('tax'), refund, netRevenue: paid, invoiced: sum('total'), completed: transactions.length, orders: orders.length } }
}
export async function dashboard(user, date) {
  permit(user, ADMIN_ROLES)
  const orders = await listOrders(user, { date }); const therapists = await listMaster('therapists', user)
  const schedules = await listMaster('schedules', user, { date })
  if (user.role === 'LOCATION_ADMIN') return adminDashboard(user, date, orders, therapists, schedules)
  const payments = await db.select({ payment: s.payments }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).where(orderScope(user))
  const local = value => DateTime.fromJSDate(value, { zone: 'Asia/Makassar' }).toISODate()
  const revenue = payments.filter(p => p.payment.status === 'SUCCESS' && local(p.payment.paidAt) === date).reduce((n,p) => n + Number(p.payment.amount), 0)
  const monthRevenue = payments.filter(p => p.payment.status === 'SUCCESS' && local(p.payment.paidAt).slice(0,7) === date.slice(0,7)).reduce((n,p) => n + Number(p.payment.amount), 0)
  const statuses = status => orders.filter(o => o.orderStatus === status).length
  const days = Array.from({ length: 7 }, (_,i) => DateTime.fromISO(date).minus({ days: 6 - i }).toISODate())
  const chart = days.map(day => ({ day, revenue: payments.filter(p => p.payment.status === 'SUCCESS' && local(p.payment.paidAt) === day).reduce((n,p) => n + Number(p.payment.amount), 0) }))
  const reference = DateTime.fromISO(`${date}T${DateTime.now().setZone('Asia/Makassar').toFormat('HH:mm')}`, { zone: 'Asia/Makassar' }).toJSDate()
  const available = therapists.filter(t => t.isActive && schedules.some(sc => sc.therapistId === t.id && sc.status === 'AVAILABLE' && reference >= DateTime.fromISO(`${date}T${sc.startTime}`, { zone: 'Asia/Makassar' }).toJSDate() && reference < DateTime.fromISO(`${date}T${sc.endTime}`, { zone: 'Asia/Makassar' }).toJSDate()) && !orders.some(o => o.assignment?.therapistId === t.id && (['ON_THE_WAY','ARRIVED','IN_PROGRESS'].includes(o.orderStatus) || (['ASSIGNED_THERAPIST','ACCEPTED'].includes(o.orderStatus) && reference >= o.bookingStartsAt && reference < o.bookingEndsAt))))
  return { date, metrics: { ordersToday: orders.length, newOrders: statuses('NEW'), waitingAssignment: orders.filter(o => ['CONFIRMED','ASSIGNED_LOCATION','THERAPIST_REJECTED','NO_THERAPIST_AVAILABLE'].includes(o.orderStatus)).length, onTheWay: statuses('ON_THE_WAY'), inProgress: statuses('IN_PROGRESS'), activeJobs: orders.filter(o => ['ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS'].includes(o.orderStatus)).length, completed: orders.filter(o => ['COMPLETED','PAID','CLOSED'].includes(o.orderStatus)).length, cancelled: orders.filter(o => o.orderStatus.startsWith('CANCELLED')).length, revenue, monthRevenue, availableTherapists: available.length }, orders, chart, locations: (await listMaster('locations', user)).map(l => ({ ...l, orders: orders.filter(o => o.locationId === l.id).length })), therapists: therapists.map(t => ({ ...t, availability: available.some(a => a.id === t.id) ? 'AVAILABLE' : ['OFF','LEAVE'].includes(schedules.find(sc => sc.therapistId === t.id)?.status) ? schedules.find(sc => sc.therapistId === t.id).status : schedules.some(sc => sc.therapistId === t.id) ? 'BOOKED' : 'OFF' })) }
}

function adminDashboard(user, date, orders, therapists, schedules) {
  const operationalOrders = orders.map(o => ({ id:o.id, orderNumber:o.orderNumber, customerName:o.customerName, bookingDate:o.bookingDate, bookingTime:o.bookingTime, orderStatus:o.orderStatus, locationName:o.locationName, items:o.items.map(i=>({serviceNameSnapshot:i.serviceNameSnapshot,durationMinutes:i.durationMinutes,qty:i.qty})), assignment:o.assignment?{therapistName:o.assignment.therapistName,therapistId:o.assignment.therapistId}:null }))
  const team = therapists.map(t => {
    const daySchedules=schedules.filter(sc=>sc.therapistId===t.id)
    const jobs=orders.filter(o=>o.assignment?.therapistId===t.id&&o.assignment.isActive&&!['COMPLETED','PAID','CLOSED','CANCELLED_BY_ADMIN','CANCELLED_BY_CUSTOMER'].includes(o.orderStatus))
    const schedule=daySchedules.find(sc=>sc.status==='AVAILABLE')||daySchedules[0]
    return {id:t.id,name:t.name,phone:t.phone,isActive:t.isActive,locations:t.locations.map(l=>({name:l.name})),availability:!t.isActive?'OFF':jobs.length?'BOOKED':schedule?.status||'OFF',startTime:schedule?.startTime||null,endTime:schedule?.endTime||null,activeJobs:jobs.length}
  })
  return {view:'LOCATION_ADMIN',date,metrics:{ordersToday:orders.length,newOrders:orders.filter(o=>o.orderStatus==='NEW').length,waitingAssignment:orders.filter(o=>['NEW','CONFIRMED','ASSIGNED_LOCATION','THERAPIST_REJECTED','NO_THERAPIST_AVAILABLE'].includes(o.orderStatus)).length,waitingResponse:orders.filter(o=>o.orderStatus==='ASSIGNED_THERAPIST').length,inProgress:orders.filter(o=>o.orderStatus==='IN_PROGRESS').length,activeJobs:orders.filter(o=>['ACCEPTED','ON_THE_WAY','ARRIVED','IN_PROGRESS'].includes(o.orderStatus)).length,completed:orders.filter(o=>['COMPLETED','PAID','CLOSED'].includes(o.orderStatus)).length,availableTherapists:team.filter(t=>t.availability==='AVAILABLE').length},orders:operationalOrders,therapists:team}
}
