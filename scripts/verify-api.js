import assert from 'node:assert/strict'
import { elapseTreatment } from './test-support/treatment.js'
import { DateTime } from 'luxon'
import { eq, inArray, sql, or } from 'drizzle-orm'
import { db,pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
const base=process.env.TEST_APP_URL||'http://localhost:3000'
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'API tests only run on localhost')
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname),'Tests require a local database')
const password=process.env.SEED_PASSWORD;const suffix=Date.now();let checks=0
const createdOrders=[];const createdCustomers=[];const createdServices=[];const createdSchedules=[];const createdPayments=[];const sessionTokens=[]
async function request(path, {cookie,method='GET',body,expected=200,origin}={}){
 const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(origin?{origin}:{})},body:body?JSON.stringify(body):undefined})
 const value=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);checks++;return {value,response}
}
async function login(email){const {value,response}=await request('/api/auth/login',{method:'POST',body:{email,password}});const setCookie=response.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i);sessionTokens.push(setCookie.split(';')[0]);return {cookie:setCookie.split(';')[0],user:value.user}}
try{
 await request('/api/orders',{expected:401})
 const owner=await login('owner@serene.local'),cs=await login('cs@serene.local'),admin=await login('admin@serene.local'),ayu=await login('ayu@serene.local'),made=await login('made@serene.local')
 await request('/api/users',{cookie:cs.cookie,expected:403})
 await request('/api/reports',{cookie:cs.cookie,expected:403})
 await request('/api/locations',{cookie:cs.cookie,method:'POST',body:{name:'Forbidden',code:'FORBIDDEN'},expected:403})
 await request('/api/customers',{cookie:owner.cookie,method:'POST',body:{name:'CSRF',phone:'+628111111111'},origin:'https://untrusted.example',expected:403})
 const {value:customer}=await request('/api/customers',{cookie:cs.cookie,method:'POST',body:{name:`API Test ${suffix}`,phone:`+62${String(suffix).slice(-12)}`,notes:'Automated local verification'}});createdCustomers.push(customer.id)
 const {value:service}=await request('/api/services',{cookie:owner.cookie,method:'POST',body:{name:`Test Massage ${suffix}`,code:`TEST-${suffix}`,durationMinutes:60,price:100000}});createdServices.push(service.id)
 const {value:locations}=await request('/api/locations',{cookie:owner.cookie});const seminyak=locations.find(l=>l.code==='SMY');const canggu=locations.find(l=>l.code==='CGU')
 const {value:savedAddress}=await request(`/api/customers/${customer.id}/addresses`,{cookie:cs.cookie,method:'POST',body:{label:'Villa',address:'Villa API Test',isDefault:true,latitude:-8.6705,longitude:115.2126}})
 const date=DateTime.now().setZone('Asia/Makassar').plus({days:10}).toISODate()
 async function order(time='10:00',locationId=null){const {value:row}=await request('/api/orders',{cookie:cs.cookie,method:'POST',body:{customerId:customer.id,locationId,bookingDate:date,bookingTime:time,address:'Villa API Test',customerAddressId:savedAddress.id,latitude:-8.6705,longitude:115.2126,services:[{serviceId:service.id,qty:1}],source:'ADMIN'}});createdOrders.push(row.id);return row}
 async function action(row,name,actor=owner,body={},expected=200){return request(`/api/orders/${row.id}/${name}`,{cookie:actor.cookie,method:'POST',body,expected})}
 async function dispatch(row,location=seminyak){await action(row,'confirm',cs);await action(row,'assign-location',cs,{locationId:location.id})}
 const first=await order()
 await request(`/api/customers/${customer.id}/addresses/${savedAddress.id}`,{cookie:cs.cookie,method:'PATCH',body:{label:'Villa',address:'New saved address',latitude:-8.7,longitude:115.3}})
 const {value:pinned}=await request(`/api/orders/${first.id}`,{cookie:owner.cookie});assert.equal(Number(pinned.latitude),-8.6705);assert.equal(Number(pinned.longitude),115.2126)
 await request('/api/orders',{cookie:cs.cookie,method:'POST',body:{customerId:customer.id,locationId:null,bookingDate:date,bookingTime:'10:00',address:'Invalid pin',services:[{serviceId:service.id,qty:1}],latitude:-8.67},expected:422})
 await request(`/api/orders/${first.id}`,{cookie:admin.cookie,expected:404})
 await request('/api/orders',{cookie:cs.cookie,method:'POST',body:{customerId:customer.id,bookingDate:date,bookingTime:'10:00',address:'Test',services:[{serviceId:service.id,qty:0}]},expected:422})
 await action(first,'assign-therapist',owner,{therapistId:ayu.user.therapistId},409)
 await dispatch(first)
 await action(first,'assign-therapist',cs,{therapistId:ayu.user.therapistId},403)
 await action(first,'assign-therapist',admin,{therapistId:ayu.user.therapistId})
 await request(`/api/orders/${first.id}`,{cookie:made.cookie,expected:404})
 const {value:therapistPin}=await request(`/api/orders/${first.id}`,{cookie:ayu.cookie});assert.equal(Number(therapistPin.latitude),-8.6705);assert.equal(Number(therapistPin.longitude),115.2126)
 await action(first,'start',ayu,{},409)
 await action(first,'accept',ayu)
 await action(first,'on-the-way',ayu);await action(first,'arrived',ayu);await action(first,'start',ayu);await action(first,'complete',ayu,{},409);await elapseTreatment(first.id);await action(first,'complete',ayu)
 await request('/api/payments',{cookie:cs.cookie,method:'POST',body:{orderId:first.id,amount:100000,paymentMethod:'CASH'},expected:403})
 const {value:partial}=await request('/api/payments',{cookie:owner.cookie,method:'POST',body:{orderId:first.id,amount:40000,paymentMethod:'CASH'}})
 await request('/api/payments',{cookie:owner.cookie,method:'POST',body:{orderId:first.id,amount:70000,paymentMethod:'CASH'},expected:409})
 createdPayments.push(partial.id)
 const {value:final}=await request('/api/payments',{cookie:owner.cookie,method:'POST',body:{orderId:first.id,amount:60000,paymentMethod:'QRIS'}})
 createdPayments.push(final.id)
 await action(first,'close',owner)
 const {value:detail}=await request(`/api/orders/${first.id}`,{cookie:owner.cookie});assert.equal(detail.orderStatus,'CLOSED');assert.equal(detail.paymentStatus,'PAID');assert.equal(detail.logs.length,11);assert.equal(detail.payments.length,2)
 await request('/api/services/'+service.id,{cookie:owner.cookie,method:'PATCH',body:{name:`Renamed Test ${suffix}`,code:service.code,durationMinutes:90,price:150000}})
 const {value:snapshot}=await request(`/api/orders/${first.id}`,{cookie:owner.cookie});assert.equal(snapshot.items[0].serviceNameSnapshot,service.name);assert.equal(snapshot.items[0].price,'100000.00');assert.equal(snapshot.items[0].durationMinutes,60)
 const foreign=await order('13:00',canggu.id);await dispatch(foreign,canggu)
 await request(`/api/orders/${foreign.id}`,{cookie:admin.cookie,expected:404})
 await action(foreign,'assign-therapist',admin,{therapistId:ayu.user.therapistId},404)
 await action(foreign,'assign-therapist',owner,{therapistId:ayu.user.therapistId},409)
 const {value:adminOrders}=await request('/api/orders',{cookie:admin.cookie});assert(adminOrders.every(o=>o.locationId===seminyak.id))
 await request('/api/customers',{cookie:admin.cookie,expected:403});const {value:adminOptions}=await request('/api/orders/options',{cookie:admin.cookie});assert(adminOptions.customers.some(c=>c.id===customer.id))
 const a=await order('15:00'),b=await order('15:30');await dispatch(a);await dispatch(b)
 const concurrent=await Promise.all([a,b].map(row=>fetch(`${base}/api/orders/${row.id}/assign-therapist`,{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:JSON.stringify({therapistId:ayu.user.therapistId})})))
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);checks++
 const accepted=concurrent[0].status===200?a:b
 await action(accepted,'reject',ayu,{notes:'Transport unavailable'})
 await action(accepted,'assign-therapist',admin,{therapistId:made.user.therapistId})
 await action(accepted,'accept',made)
 const {value:reassigned}=await request(`/api/orders/${accepted.id}`,{cookie:owner.cookie});assert.equal(reassigned.assignments.length,2);assert(reassigned.assignments.some(a=>a.responseStatus==='REJECTED'&&a.rejectionReason==='Transport unavailable'));assert(reassigned.logs.some(l=>l.toStatus==='THERAPIST_REJECTED'))
 await action(accepted,'on-the-way',ayu,{},403)
 const {value:ownHistory}=await request('/api/orders',{cookie:ayu.cookie});assert(ownHistory.some(o=>o.id===accepted.id&&!o.assignment.isActive&&o.assignment.responseStatus==='REJECTED'))
 await request(`/api/therapists/${made.user.therapistId}/schedules`,{cookie:admin.cookie,method:'POST',body:{therapistId:made.user.therapistId,locationId:seminyak.id,scheduleDate:date,startTime:'08:00',endTime:'22:00',status:'OFF'},expected:409})
 const offDate=DateTime.now().setZone('Asia/Makassar').plus({days:25}).toISODate()
 const {value:offSchedule}=await request(`/api/therapists/${ayu.user.therapistId}/schedules`,{cookie:admin.cookie,method:'POST',body:{therapistId:ayu.user.therapistId,locationId:seminyak.id,scheduleDate:offDate,startTime:'08:00',endTime:'22:00',status:'LEAVE'}});createdSchedules.push(offSchedule.id)
 const {value:offOrder}=await request('/api/orders',{cookie:cs.cookie,method:'POST',body:{customerId:customer.id,locationId:null,bookingDate:offDate,bookingTime:'10:00',address:'Villa off test',services:[{serviceId:service.id,qty:1}]}});createdOrders.push(offOrder.id);await dispatch(offOrder);await action(offOrder,'assign-therapist',admin,{therapistId:ayu.user.therapistId},409)
 await request(`/api/payments/${final.id}/refund`,{cookie:admin.cookie,method:'POST',expected:403})
 await request(`/api/payments/${final.id}/refund`,{cookie:owner.cookie,method:'POST'})
 await request(`/api/payments/${final.id}/refund`,{cookie:owner.cookie,method:'POST',expected:409})
 const {value:refunded}=await request(`/api/orders/${first.id}`,{cookie:owner.cookie});assert.equal(refunded.paymentStatus,'PARTIAL');assert.equal(refunded.orderStatus,'COMPLETED')
 await request('/api/reports',{cookie:admin.cookie,expected:403});const {value:locationReport}=await request(`/api/reports?locationId=${seminyak.id}`,{cookie:owner.cookie});assert(locationReport.orders.every(o=>o.locationId===seminyak.id));assert(locationReport.locations.every(l=>l.id===seminyak.id||l.orders===0))

 // Public booking must be atomic and may not overwrite an existing customer profile.
 const publicPhone=`+629${String(suffix).slice(-11)}`
 await request('/api/public/booking',{method:'POST',body:{name:'Invalid partial pin',phone:publicPhone,locationId:null,bookingDate:date,bookingTime:'10:00',address:'Invalid pin test',services:[{serviceId:service.id,qty:1}],latitude:-8.67},expected:422})
 await request('/api/public/booking',{method:'POST',body:{name:'Public invalid test',phone:publicPhone,locationId:null,bookingDate:date,bookingTime:'10:00',address:'Villa public test',services:[{serviceId:2147483647,qty:1}]},expected:400})
 assert.equal((await db.select().from(s.customers).where(eq(s.customers.phone,publicPhone))).length,0)
 const {value:publicBooking}=await request('/api/public/booking',{method:'POST',body:{name:`Public Guest ${suffix}`,phone:publicPhone,locationId:null,bookingDate:date,bookingTime:'11:00',address:'Villa public test',latitude:-8.6705,longitude:115.2126,services:[{serviceId:service.id,qty:1}]}})
 const [publicOrder]=await db.select().from(s.orders).where(eq(s.orders.orderNumber,publicBooking.orderNumber));createdOrders.push(publicOrder.id);createdCustomers.push(publicOrder.customerId);assert.equal(publicOrder.orderStatus,'NEW');assert.equal(publicOrder.source,'WEB');assert.equal(Number(publicOrder.latitude),-8.6705);assert.equal(Number(publicOrder.longitude),115.2126)
 await request(`/api/orders/${publicOrder.id}`,{cookie:cs.cookie,method:'PATCH',body:{customerId:publicOrder.customerId,locationId:null,bookingDate:date,bookingTime:'11:00',address:publicOrder.addressSnapshot,latitude:null,longitude:null,services:[{serviceId:service.id,qty:1}]}})
 const {value:clearedPin}=await request(`/api/orders/${publicOrder.id}`,{cookie:cs.cookie});assert.equal(clearedPin.latitude,null);assert.equal(clearedPin.longitude,null)
 // A fully discounted order must finish without leaving a zero balance stuck in COMPLETED.
 const {value:free}=await request('/api/orders',{cookie:cs.cookie,method:'POST',body:{customerId:customer.id,locationId:null,bookingDate:date,bookingTime:'19:00',address:'Villa complimentary test',services:[{serviceId:service.id,qty:1}],discount:150000}});createdOrders.push(free.id)
 await dispatch(free);await action(free,'assign-therapist',admin,{therapistId:ayu.user.therapistId})
 for(const actionName of ['accept','on-the-way','arrived','start'])await action(free,actionName,ayu)
 await elapseTreatment(free.id);await action(free,'complete',ayu)
 const {value:freeDetail}=await request(`/api/orders/${free.id}`,{cookie:owner.cookie});assert.equal(freeDetail.paymentStatus,'PAID');assert.equal(freeDetail.orderStatus,'PAID');assert.equal(freeDetail.payments.length,0)
 await action(free,'close',admin)
 await request('/api/notifications',{cookie:ayu.cookie,method:'PATCH'})
 await request('/api/auth/logout',{cookie:owner.cookie,method:'POST'});await request('/api/auth/me',{cookie:owner.cookie,expected:401})
 console.log(`PASS: ${checks} API checks; workflow, role/location isolation, snapshots, concurrent conflict, rejection, schedules, partial payments, refund and logout.`)
}finally{
 for(const cookie of sessionTokens)await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie}}).catch(()=>{})
 // Remove only records explicitly created in this run, keeping demo/business data intact.
 await db.transaction(async tx=>{
  if(createdOrders.length){await tx.delete(s.notifications).where(sql`(${s.notifications.data}->>'orderId')::integer in (${sql.join(createdOrders.map(id=>sql`${id}`),sql`, `)})`);for(const table of [s.payments,s.orderStatusLogs,s.orderAssignments,s.orderItems])await tx.delete(table).where(inArray(table.orderId,createdOrders));await tx.delete(s.orders).where(inArray(s.orders.id,createdOrders));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'orders' and ${inArray(s.auditLogs.entityId,createdOrders)}`);if(createdPayments.length)await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'payments' and ${inArray(s.auditLogs.entityId,createdPayments)}`)}
  if(createdCustomers.length){const addressIds=(await tx.select({id:s.customerAddresses.id}).from(s.customerAddresses).where(inArray(s.customerAddresses.customerId,createdCustomers))).map(a=>a.id);if(addressIds.length)await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'customer_addresses' and ${inArray(s.auditLogs.entityId,addressIds)}`);await tx.delete(s.customerAddresses).where(inArray(s.customerAddresses.customerId,createdCustomers));await tx.delete(s.customers).where(inArray(s.customers.id,createdCustomers));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'customers' and ${inArray(s.auditLogs.entityId,createdCustomers)}`)}
  if(createdServices.length){await tx.delete(s.servicePrices).where(inArray(s.servicePrices.serviceId,createdServices));await tx.delete(s.services).where(inArray(s.services.id,createdServices));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'services' and ${inArray(s.auditLogs.entityId,createdServices)}`)}
  if(createdSchedules.length){await tx.delete(s.therapistSchedules).where(inArray(s.therapistSchedules.id,createdSchedules));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'schedules' and ${inArray(s.auditLogs.entityId,createdSchedules)}`)}
 });await pool.end()
}
