import test from 'node:test'
import assert from 'node:assert/strict'
import { slot, overlaps, withinSchedule } from '../shared/utils/booking.js'
import { orderSchema, scheduleSchema } from '../shared/schemas/index.js'
test('overlap rejects partial and enclosing slots while allowing adjacent bookings', () => {
 const existing=slot('2026-09-26','14:00',90)
 assert.equal(overlaps(existing,slot('2026-09-26','15:00',90)),true)
 assert.equal(overlaps(existing,slot('2026-09-26','13:30',180)),true)
 assert.equal(overlaps(existing,slot('2026-09-26','15:30',60)),false)
 assert.equal(overlaps(existing,slot('2026-09-26','13:00',60)),false)
})
test('booking time follows location timezone and crosses midnight correctly',()=>{
 const bali=slot('2026-09-26','23:30',90,'Asia/Makassar')
 assert.equal(bali.start.toISOString(),'2026-09-26T15:30:00.000Z')
 assert.equal(bali.end.toISOString(),'2026-09-26T17:00:00.000Z')
 assert.equal(slot('2026-09-26','23:30',90,'Asia/Jakarta').start.toISOString(),'2026-09-26T16:30:00.000Z')
})
test('available schedule must contain the whole treatment and respect off/leave',()=>{
 const booking=slot('2026-09-26','14:00',90)
 const order={bookingStartsAt:booking.start,bookingEndsAt:booking.end}
 const schedule={scheduleDate:'2026-09-26',startTime:'08:00',endTime:'15:30',status:'AVAILABLE'}
 assert.equal(withinSchedule(order,schedule,'Asia/Makassar'),true)
 assert.equal(withinSchedule(order,{...schedule,endTime:'15:00'},'Asia/Makassar'),false)
 assert.equal(withinSchedule(order,{...schedule,status:'OFF'},'Asia/Makassar'),false)
 assert.equal(withinSchedule(order,{...schedule,status:'LEAVE'},'Asia/Makassar'),false)
})
test('validation rejects malformed dates, money, quantities and client-supplied status',()=>{
 const valid={customerId:1,locationId:null,bookingDate:'2026-09-26',bookingTime:'14:00',address:'Villa Test',services:[{serviceId:1,qty:1}]}
 assert.equal(orderSchema.safeParse(valid).success,true)
 for(const invalid of [{bookingDate:'2026-02-30'},{bookingTime:'24:00'},{discount:-1},{tax:1.001},{orderStatus:'PAID'},{services:[{serviceId:1,qty:0}]}])assert.equal(orderSchema.safeParse({...valid,...invalid}).success,false)
 assert.equal(scheduleSchema.safeParse({therapistId:1,locationId:1,scheduleDate:'2026-09-26',startTime:'15:00',endTime:'14:00',status:'AVAILABLE'}).success,false)
})
