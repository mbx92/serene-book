import assert from 'node:assert/strict'
import { DateTime } from 'luxon'
import { eq,inArray,sql } from 'drizzle-orm'
import { db,pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
const base=process.env.TEST_APP_URL||'http://localhost:3000'
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
let checks=0,serviceId
const cookies=[],orders=[],customers=[],therapists=[],accounts=[],payments=[]
async function request(path,cookie,method='GET',body,expected=200){const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value)}`);checks++;return {value,response}}
async function login(email){const {value,response}=await request('/api/auth/login',null,'POST',{email,password:process.env.SEED_PASSWORD});const cookie=response.headers.get('set-cookie').split(';')[0];cookies.push(cookie);return {cookie,user:value.user}}
try{
 const owner=await login('owner@serene.local'),admin=await login('admin@serene.local')
 for(const path of ['/api/payments','/api/reports','/api/users','/api/audit','/api/customers','/api/locations','/api/services','/api/schedules','/api/settings/revenue-sharing'])await request(path,admin.cookie,'GET',undefined,403)
 for(const path of ['/api/payments','/api/customers','/api/locations','/api/services','/api/users','/api/schedules'])await request(path,admin.cookie,'POST',{},403)
 const allLocations=(await request('/api/locations',owner.cookie)).value;const local=allLocations.find(l=>l.id===admin.user.locationId),foreign=allLocations.find(l=>l.id!==local.id)
 const options=(await request('/api/orders/options',admin.cookie)).value;assert(options.locations.every(l=>admin.user.locationIds.includes(l.id)))
 const suffix=Date.now(),date=DateTime.now().setZone('Asia/Makassar').plus({days:45}).toISODate()
 const customer=(await request('/api/orders/customer',admin.cookie,'POST',{name:`Admin Guest ${suffix}`,phone:`+626${String(suffix).slice(-11)}`})).value;customers.push(customer.id)
 assert((await request('/api/orders/options',admin.cookie)).value.customers.some(c=>c.id===customer.id))
 serviceId=(await request('/api/services',owner.cookie,'POST',{name:`Admin Test Service ${suffix}`,code:`ADM-${suffix}`,durationMinutes:60,price:100000})).value.id
 const body={customerId:customer.id,bookingDate:date,bookingTime:'10:00',address:'Admin access verification villa',services:[{serviceId,qty:1}]}
 await request('/api/orders',admin.cookie,'POST',{...body,locationId:foreign.id},403)
 const privateCustomer=(await request('/api/customers',owner.cookie,'POST',{name:`Foreign Guest ${suffix}`,phone:`+624${String(suffix).slice(-11)}`})).value;customers.push(privateCustomer.id)
 const privateOrder=(await request('/api/orders',owner.cookie,'POST',{...body,customerId:privateCustomer.id,locationId:foreign.id})).value;orders.push(privateOrder.id)
 assert(!(await request('/api/orders/options',admin.cookie)).value.customers.some(c=>c.id===privateCustomer.id))
 await request('/api/orders',admin.cookie,'POST',{...body,customerId:privateCustomer.id,locationId:local.id},400)
 const order=(await request('/api/orders',admin.cookie,'POST',body)).value;orders.push(order.id);assert.equal(order.locationId,local.id)
 await request(`/api/orders/${order.id}`,admin.cookie,'PATCH',{...body,bookingTime:'11:00'})
 await request(`/api/orders/${order.id}/confirm`,admin.cookie,'POST',{})
 await request(`/api/orders/${order.id}/assign-location`,admin.cookie,'POST',{locationId:foreign.id},403)
 await request(`/api/orders/${order.id}/assign-location`,admin.cookie,'POST',{locationId:local.id})
 const profile={name:`Admin Therapist ${suffix}`,email:`admin-therapist-${suffix}@test.local`,phone:'+628111223344',password:process.env.SEED_PASSWORD,employeeCode:`ADM-${suffix}`,locationIds:[local.id],gender:'',notes:'',isActive:true}
 await request('/api/therapists',admin.cookie,'POST',{...profile,locationIds:[foreign.id]},403)
 await request('/api/therapists',admin.cookie,'POST',{...profile,role:'OWNER'},422)
 const therapist=(await request('/api/therapists',admin.cookie,'POST',profile)).value;therapists.push(therapist.id);therapist.userId=(await request(`/api/therapists/${therapist.id}`,admin.cookie)).value.userId;accounts.push(therapist.userId)
 const roleRows=await db.select({code:s.roles.code}).from(s.userRoles).innerJoin(s.roles,eq(s.roles.id,s.userRoles.roleId)).where(eq(s.userRoles.userId,therapist.userId));assert.deepEqual(roleRows.map(r=>r.code),['THERAPIST'])
 await request(`/api/therapists/${therapist.id}`,admin.cookie,'PATCH',{...profile,name:profile.name+' Edited'})
 const schedule={therapistId:therapist.id,locationId:local.id,scheduleDate:date,startTime:'08:00',endTime:'22:00',status:'OFF',notes:''}
 await request(`/api/therapists/${therapist.id}/schedules`,admin.cookie,'POST',{...schedule,locationId:foreign.id},403)
 const saved=(await request(`/api/therapists/${therapist.id}/schedules`,admin.cookie,'POST',schedule)).value
 await request(`/api/orders/${order.id}/assign-therapist`,admin.cookie,'POST',{therapistId:therapist.id},409)
 await request(`/api/therapists/${therapist.id}/schedules/${saved.id}`,admin.cookie,'PATCH',{...schedule,status:'AVAILABLE'})
 await request(`/api/orders/${order.id}/assign-therapist`,admin.cookie,'POST',{therapistId:therapist.id})
 await request(`/api/therapists/${therapist.id}`,admin.cookie,'PATCH',{...profile,isActive:false},409)
 const snapshot=(await request(`/api/dashboard?date=${date}`,admin.cookie)).value
 assert.equal(snapshot.view,'LOCATION_ADMIN');assert.equal(snapshot.chart,undefined);assert.equal(snapshot.metrics.revenue,undefined);assert.equal(snapshot.metrics.monthRevenue,undefined)
 for(const row of snapshot.orders){for(const key of ['total','subtotal','discount','tax','transportFee','payments','revenueShare'])assert(!Object.hasOwn(row,key));assert(row.items.every(i=>i.price===undefined))}
 assert(snapshot.therapists.some(t=>t.id===therapist.id));assert(!Object.hasOwn(snapshot,'locations'))
 await request('/api/payments',admin.cookie,'POST',{orderId:order.id,amount:100000,paymentMethod:'CASH'},403)
 const payment=(await request('/api/payments',owner.cookie,'POST',{orderId:order.id,amount:100000,paymentMethod:'CASH'})).value;payments.push(payment.id)
 const detail=(await request(`/api/orders/${order.id}`,admin.cookie)).value;assert.equal(detail.revenueShare,undefined);assert.deepEqual(detail.payments,[]);assert.equal(detail.remainingAmount,'0.00')
 const ownerDetail=(await request(`/api/orders/${order.id}`,owner.cookie)).value;assert(ownerDetail.revenueShare);assert.equal(ownerDetail.payments.length,1)
 await request(`/api/orders/${order.id}/cancel`,admin.cookie,'POST',{notes:'Verification cancellation'},409)
 await request(`/api/payments/${payment.id}/refund`,owner.cookie,'POST')
 await request(`/api/orders/${order.id}/cancel`,admin.cookie,'POST',{notes:'Verification cancellation'})
 await request(`/api/therapists/${therapist.id}`,admin.cookie,'PATCH',{...profile,isActive:false})
 // A shared therapist may be scheduled locally, but an admin cannot overwrite their global account or foreign memberships.
 for(const [label,locationIds] of [['shared',[local.id,foreign.id]],['foreign',[foreign.id]]]){
  const created=(await request('/api/therapists',owner.cookie,'POST',{...profile,email:`${label}-${suffix}@test.local`,employeeCode:`${label}-${suffix}`,locationIds})).value;therapists.push(created.id);created.userId=(await request(`/api/therapists/${created.id}`,owner.cookie)).value.userId;accounts.push(created.userId)
  if(label==='shared'){
   const row=(await request(`/api/therapists/${created.id}`,admin.cookie)).value;assert.equal(row.canManage,false);assert(row.locations.every(l=>l.locationId===local.id))
   await request(`/api/therapists/${created.id}`,admin.cookie,'PATCH',{...profile,email:`${label}-${suffix}@test.local`,employeeCode:`${label}-${suffix}`},403)
   const memberships=await db.select().from(s.therapistLocations).where(eq(s.therapistLocations.therapistId,created.id));assert.equal(memberships.length,2)
  }else{await request(`/api/therapists/${created.id}`,admin.cookie,'GET',undefined,404);await request(`/api/therapists/${created.id}`,admin.cookie,'PATCH',profile,404)}
 }
 const other=(await request('/api/orders',owner.cookie,'POST',{...body,locationId:foreign.id})).value;orders.push(other.id)
 await request(`/api/orders/${other.id}`,admin.cookie,'GET',undefined,404)
 await request(`/api/orders/${other.id}`,admin.cookie,'PATCH',body,404)
 await request(`/api/orders/${other.id}/cancel`,admin.cookie,'POST',{notes:'Forbidden'},404)
 console.log(`PASS: ${checks} admin access checks; operational dashboard, restricted endpoints, order/customer/therapist management, location isolation, shared profiles, schedule conflicts and owner-only finances.`)
}finally{
 for(const cookie of cookies)await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie}}).catch(()=>{})
 await db.transaction(async tx=>{
  if(orders.length){await tx.delete(s.notifications).where(sql`(${s.notifications.data}->>'orderId')::integer in (${sql.join(orders.map(id=>sql`${id}`),sql`, `)})`);for(const table of [s.payments,s.orderStatusLogs,s.orderAssignments,s.orderItems])await tx.delete(table).where(inArray(table.orderId,orders));await tx.delete(s.orders).where(inArray(s.orders.id,orders));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'orders' and ${inArray(s.auditLogs.entityId,orders)}`)}
  if(payments.length)await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'payments' and ${inArray(s.auditLogs.entityId,payments)}`)
  if(therapists.length){await tx.delete(s.therapistSchedules).where(inArray(s.therapistSchedules.therapistId,therapists));await tx.delete(s.therapistLocations).where(inArray(s.therapistLocations.therapistId,therapists));await tx.delete(s.therapists).where(inArray(s.therapists.id,therapists));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'therapists' and ${inArray(s.auditLogs.entityId,therapists)}`)}
  if(accounts.length){await tx.delete(s.notifications).where(inArray(s.notifications.userId,accounts));await tx.delete(s.userRoles).where(inArray(s.userRoles.userId,accounts));await tx.delete(s.users).where(inArray(s.users.id,accounts))}
  if(customers.length){await tx.delete(s.customers).where(inArray(s.customers.id,customers));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'customers' and ${inArray(s.auditLogs.entityId,customers)}`)}
  if(serviceId){await tx.delete(s.servicePrices).where(eq(s.servicePrices.serviceId,serviceId));await tx.delete(s.services).where(eq(s.services.id,serviceId));await tx.delete(s.auditLogs).where(sql`${s.auditLogs.entity} = 'services' and ${s.auditLogs.entityId} = ${serviceId}`)}
 });await pool.end()
}
