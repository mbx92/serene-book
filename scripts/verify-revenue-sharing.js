import assert from 'node:assert/strict'
import { DateTime } from 'luxon'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
import { elapseTreatment } from './test-support/treatment.js'
const base=process.env.TEST_APP_URL||'http://localhost:3000'
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname))
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
let checks=0, original, originalBilling, customerId, serviceId
const cookies=[], orderIds=[], paymentIds=[]
async function request(path,cookie,method='GET',body,expected=200) {
 const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
 const value=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);checks++;return {value,response}
}
async function login(email) {const {response,value}=await request('/api/auth/login',null,'POST',{email,password:process.env.SEED_PASSWORD});const cookie=response.headers.get('set-cookie').split(';')[0];cookies.push(cookie);return {cookie,user:value.user}}
const policy = (ownerPercent=10,adminPercent=10,therapistPercent=80,trigger='PAYMENT_RECEIVED')=>({ownerPercent,adminPercent,therapistPercent,trigger})
let owner
try {
 owner=await login('owner@serene.local');const admin=await login('admin@serene.local'),cs=await login('cs@serene.local'),therapist=await login('ayu@serene.local')
 original=(await request('/api/settings/revenue-sharing',owner.cookie)).value
 originalBilling=(await request('/api/settings/billing',owner.cookie)).value
 await request('/api/settings/billing',owner.cookie,'PATCH',{transportEnabled:true,taxEnabled:true})
 for(const actor of [admin,cs,therapist]) {await request('/api/settings/revenue-sharing',actor.cookie,'GET',undefined,403);await request('/api/settings/revenue-sharing',actor.cookie,'PATCH',policy(),403)}
 await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',policy(10,10,79),422)
 await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',policy())
 const suffix=Date.now()
 customerId=(await request('/api/customers',cs.cookie,'POST',{name:`Revenue Test ${suffix}`,phone:`+627${String(suffix).slice(-11)}`})).value.id
 serviceId=(await request('/api/services',owner.cookie,'POST',{name:`Revenue Service ${suffix}`,code:`REV-${suffix}`,durationMinutes:60,price:100000})).value.id
 const location=(await request('/api/locations',owner.cookie)).value.find(l=>l.code==='SMY')
 const date=DateTime.now().setZone('Asia/Makassar').plus({days:10}).toISODate()
 async function create(time) {const body={customerId,locationId:location.id,bookingDate:date,bookingTime:time,address:'Revenue verification villa',services:[{serviceId,qty:1}],discount:10000,transportFee:20000,tax:10000};const {value}=await request('/api/orders',cs.cookie,'POST',body);orderIds.push(value.id);return {order:value,body}}
 async function detail(order) {return (await request(`/api/orders/${order.id}`,owner.cookie)).value}
 async function pay(order,amount) {const {value}=await request('/api/payments',owner.cookie,'POST',{orderId:order.id,amount,paymentMethod:'CASH'});paymentIds.push(value.id);return value}
 async function action(order,name,actor=owner,body={}) {return request(`/api/orders/${order.id}/${name}`,actor.cookie,'POST',body)}
 async function start(order) {await action(order,'confirm',cs);await action(order,'assign-location',cs,{locationId:location.id});await action(order,'assign-therapist',admin,{therapistId:therapist.user.therapistId});for(const name of ['accept','on-the-way','arrived','start'])await action(order,name,therapist)}
 const {order:first,body:firstBody}=await create('09:00')
 const p1=await pay(first,60000)
 let row=await detail(first)
 assert.equal(row.orderStatus,'NEW');assert.equal(row.paymentStatus,'PARTIAL');assert.equal(row.revenueShare.allocatedBase,'45000.00');assert.equal(row.revenueShare.ownerAmount,'4500.00');assert.equal(row.revenueShare.adminAmount,'4500.00');assert.equal(row.revenueShare.therapistAmount,'36000.00');assert.equal(row.revenueShare.events.length,1)
 await request(`/api/orders/${first.id}`,cs.cookie,'PATCH',firstBody,409)
 await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',policy(20,20,60))
 const p2=await pay(first,60000);row=await detail(first)
 assert.equal(row.orderStatus,'NEW');assert.equal(row.paymentStatus,'PAID');assert.equal(row.revenueShare.ownerPercent,'10.00');assert.equal(row.revenueShare.ownerAmount,'9000.00');assert.equal(row.revenueShare.therapistAmount,'72000.00')
 await request('/api/payments',owner.cookie,'POST',{orderId:first.id,amount:1,paymentMethod:'CASH'},409)
 await start(first);await elapseTreatment(first.id);await action(first,'complete',therapist)
 row=await detail(first);assert.equal(row.orderStatus,'PAID');assert.equal(row.revenueShare.therapistId,therapist.user.therapistId);assert.equal(row.revenueShare.events.length,3)
 const safe=(await request(`/api/orders/${first.id}`,therapist.cookie)).value;assert.equal(safe.revenueShare,undefined)
 await action(first,'close',admin);await request(`/api/payments/${p2.id}/refund`,owner.cookie,'POST')
 row=await detail(first);assert.equal(row.orderStatus,'COMPLETED');assert.equal(row.revenueShare.allocatedBase,'45000.00');assert.equal(row.revenueShare.events.at(-1).therapistDelta,'-36000.00')
 await request(`/api/payments/${p2.id}/refund`,owner.cookie,'POST',undefined,409)
 await pay(first,60000);assert.equal((await detail(first)).revenueShare.allocatedBase,'90000.00')
 await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',policy(20,20,60,'ORDER_COMPLETED'))
 const {order:second}=await create('12:00');const p3=await pay(second,60000)
 row=await detail(second);assert.equal(row.revenueShare.allocatedBase,'0.00');assert.equal(row.revenueShare.collectedBase,'45000.00')
 await start(second);await elapseTreatment(second.id);await action(second,'complete',therapist)
 row=await detail(second);assert.equal(row.orderStatus,'COMPLETED');assert.equal(row.revenueShare.ownerAmount,'9000.00');assert.equal(row.revenueShare.therapistAmount,'27000.00')
 await request(`/api/payments/${p3.id}/refund`,owner.cookie,'POST');assert.equal((await detail(second)).revenueShare.allocatedBase,'0.00')
 await pay(second,120000);assert.equal((await detail(second)).revenueShare.therapistAmount,'54000.00')
 // Completion before payment also freezes the current policy, then waits for collected funds.
 const {order:third}=await create('15:00');await start(third);await elapseTreatment(third.id);await action(third,'complete',therapist)
 await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',policy(5,5,90));await pay(third,120000)
 assert.equal((await detail(third)).revenueShare.therapistAmount,'54000.00')
 const report=(await request(`/api/reports?from=${date}&to=${date}&locationId=${location.id}`,owner.cookie)).value
 assert(report.summary.ownerShare>=45000);assert(report.therapists.find(t=>t.id===therapist.user.therapistId).commission>=180000)
 // Concurrent requests cannot collect or allocate more than the invoice.
 const {order:fourth}=await create('18:00')
 const results=await Promise.all([1,2].map(()=>request('/api/payments',owner.cookie,'POST',{orderId:fourth.id,amount:60000,paymentMethod:'CASH'})))
 paymentIds.push(...results.map(r=>r.value.id));row=await detail(fourth);assert.equal(row.revenueShare.allocatedBase,'90000.00');assert.equal(row.revenueShare.therapistAmount,'81000.00')
 for(const result of results)await request(`/api/payments/${result.value.id}/refund`,owner.cookie,'POST')
 await action(fourth,'cancel',owner,{notes:'Verification cancellation'});assert.equal((await detail(fourth)).revenueShare.allocatedBase,'0.00')
 await request('/api/payments',owner.cookie,'POST',{orderId:fourth.id,amount:1,paymentMethod:'CASH'},409)
 // A rejected offer must not keep a prepaid commission attributed to that therapist.
 const {order:fifth}=await create('20:00');await pay(fifth,120000)
 await action(fifth,'confirm',cs);await action(fifth,'assign-location',cs,{locationId:location.id});await action(fifth,'assign-therapist',admin,{therapistId:therapist.user.therapistId})
 assert.equal((await detail(fifth)).revenueShare.therapistId,therapist.user.therapistId)
 await action(fifth,'reject',therapist,{notes:'Verification rejection'})
 row=await detail(fifth);assert.equal(row.revenueShare.therapistId,null);assert.equal(row.revenueShare.therapistAmount,'81000.00')
 for(const orderId of orderIds) {
  const share=(await detail({id:orderId})).revenueShare
  for(const role of ['owner','admin','therapist']) assert.equal(Math.round(share.events.reduce((n,e)=>n+Number(e[role+'Delta']),0)*100),Math.round(Number(share[role+'Amount'])*100))
 }
 // Billing flags are enforced by the server, including requests from stale forms.
 for(const actor of [admin,cs]) {await request('/api/settings/billing',actor.cookie);await request('/api/settings/billing',actor.cookie,'PATCH',{transportEnabled:false,taxEnabled:false},403)}
 await request('/api/settings/billing',therapist.cookie,'GET',undefined,403)
 await request('/api/settings/billing',owner.cookie,'PATCH',{transportEnabled:'false',taxEnabled:false},422)
 for(const [transportEnabled,taxEnabled,expected] of [[false,false,'90000.00'],[true,false,'110000.00'],[false,true,'100000.00']]) {
  await request('/api/settings/billing',owner.cookie,'PATCH',{transportEnabled,taxEnabled})
  const catalog=(await request('/api/public/catalog')).value;assert.deepEqual(catalog.billing,{transportEnabled,taxEnabled})
  const {order,body}=await create('22:00')
  assert.equal(order.total,expected);assert.equal(order.transportFee,transportEnabled?'20000.00':'0.00');assert.equal(order.tax,taxEnabled?'10000.00':'0.00')
  await request('/api/settings/billing',owner.cookie,'PATCH',{transportEnabled:false,taxEnabled:false})
  const saved=await detail(order);assert.equal(saved.total,expected)
  await request(`/api/orders/${order.id}`,cs.cookie,'PATCH',body)
  assert.equal((await detail(order)).total,'90000.00')
 }
 const historical=await detail(first);assert.equal(historical.total,'120000.00');assert.equal(historical.transportFee,'20000.00');assert.equal(historical.tax,'10000.00');assert.equal(historical.revenueShare.allocatedBase,'90000.00')
 console.log(`PASS: ${checks} revenue API checks; dynamic settings, roles, net service basis, prepayment, partial payment, snapshots, deferred allocation, refund, concurrent payment and cancellation.`)
} finally {
 if(originalBilling&&owner)await request('/api/settings/billing',owner.cookie,'PATCH',originalBilling)
 if(original&&owner)await request('/api/settings/revenue-sharing',owner.cookie,'PATCH',{ownerPercent:Number(original.ownerPercent),adminPercent:Number(original.adminPercent),therapistPercent:Number(original.therapistPercent),trigger:original.trigger})
 for(const cookie of cookies)await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie}}).catch(()=>{})
 await db.transaction(async tx=>{
  if(orderIds.length){await tx.delete(s.notifications).where(sql`(${s.notifications.data}->>'orderId')::integer in (${sql.join(orderIds.map(id=>sql`${id}`),sql`, `)})`);for(const table of [s.payments,s.orderStatusLogs,s.orderAssignments,s.orderItems])await tx.delete(table).where(inArray(table.orderId,orderIds));await tx.delete(s.orders).where(inArray(s.orders.id,orderIds));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'orders' and ${inArray(s.auditLogs.entityId,orderIds)}`)}
  if(paymentIds.length)await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'payments' and ${inArray(s.auditLogs.entityId,paymentIds)}`)
  if(customerId){await tx.delete(s.customers).where(eq(s.customers.id,customerId));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'customers' and ${s.auditLogs.entityId} = ${customerId}`)}
  if(serviceId){await tx.delete(s.servicePrices).where(eq(s.servicePrices.serviceId,serviceId));await tx.delete(s.services).where(eq(s.services.id,serviceId));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'services' and ${s.auditLogs.entityId} = ${serviceId}`)}
 });await pool.end()
}
