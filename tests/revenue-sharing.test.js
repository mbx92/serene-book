import test from 'node:test'
import assert from 'node:assert/strict'
import { splitRevenue, collectedServiceCents, cents } from '../shared/utils/revenue-sharing.js'
import { revenueSharingSchema } from '../shared/schemas/index.js'
test('revenue splitting preserves every cent for decimal percentages and very small amounts', () => {
  for (const policy of [{ownerPercent:10,adminPercent:10,therapistPercent:80}, {ownerPercent:33.33,adminPercent:33.33,therapistPercent:33.34}, {ownerPercent:0,adminPercent:0,therapistPercent:100}]) {
    for (const amount of [0,1,2,9,101,99999999999]) assert.equal(Object.values(splitRevenue(amount, policy)).reduce((n,v)=>n+cents(v),0),amount)
  }
  assert.deepEqual(splitRevenue(10000000,{ownerPercent:10,adminPercent:10,therapistPercent:80}),{ownerAmount:'10000.00',adminAmount:'10000.00',therapistAmount:'80000.00'})
})
test('partial payment excludes transport and tax proportionally and caps at net service value', () => {
  const order = {subtotal:'100000.00',discount:'10000.00',transportFee:'20000.00',tax:'10000.00',total:'120000.00'}
  assert.equal(collectedServiceCents(order,cents(60000)),cents(45000))
  assert.equal(collectedServiceCents(order,cents(120000)),cents(90000))
  assert.equal(collectedServiceCents(order,cents(200000)),cents(90000))
  assert.equal(collectedServiceCents({...order,subtotal:'10000',discount:'10000',total:'30000'},cents(30000)),0)
  assert.equal(collectedServiceCents({subtotal:'10000',discount:'10000',total:'0'},0),0)
})
test('settings reject percentages outside range, excessive decimals and totals other than 100', () => {
  assert(revenueSharingSchema.safeParse({ownerPercent:10,adminPercent:10,therapistPercent:80,trigger:'PAYMENT_RECEIVED'}).success)
  for (const values of [[10,10,79],[-10,10,100],[10.001,9.999,80]]) assert(!revenueSharingSchema.safeParse({ownerPercent:values[0],adminPercent:values[1],therapistPercent:values[2],trigger:'PAYMENT_RECEIVED'}).success)
})
