import test from 'node:test'
import assert from 'node:assert/strict'
import { hasCoordinates, parseLocationInput, directionsUrl } from '../shared/utils/location.js'
import { orderSchema, publicBookingSchema, addressSchema } from '../shared/schemas/index.js'
const booking = { name:'Map Guest',phone:'+6281234567890',bookingDate:'2026-09-26',bookingTime:'14:00',address:'Villa pin test',locationId:null,services:[{serviceId:1,qty:1}] }
test('pins require a complete pair, keep zero coordinates valid, and never coerce missing/boolean values into a location',()=>{
 assert.equal(hasCoordinates({latitude:0,longitude:0}),true)
 for(const point of [null,{latitude:null,longitude:null},{latitude:'',longitude:''},{latitude:' ',longitude:' '},{latitude:false,longitude:false},{latitude:-91,longitude:115},{latitude:-8,longitude:181}])assert.equal(hasCoordinates(point),false)
 for(const point of [{latitude:-8.67},{longitude:115.21},{latitude:-91,longitude:115.21},{latitude:false,longitude:false}])assert.equal(publicBookingSchema.safeParse({...booking,...point}).success,false)
 assert.equal(publicBookingSchema.safeParse({...booking,latitude:null,longitude:null}).success,true)
 const {name,phone,...order}=booking
 assert.equal(orderSchema.safeParse({...order,customerId:1,latitude:-8.67,longitude:115.21}).success,true)
 assert.equal(addressSchema.safeParse({label:'Villa',address:'Villa test',latitude:0,longitude:0}).success,true)
})
test('maps links use the place pin rather than the map camera center and reject ambiguous or untrusted URLs',()=>{
 assert.deepEqual(parseLocationInput('-8.6705, 115.2126'),{latitude:-8.6705,longitude:115.2126})
 assert.deepEqual(parseLocationInput('https://www.google.com/maps/search/?api=1&query=-8.6705%2C115.2126'),{latitude:-8.6705,longitude:115.2126})
 assert.deepEqual(parseLocationInput('https://www.google.com/maps/place/Villa/@-8.7,115.3,16z/data=!4m2!3d-8.6705!4d115.2126'),{latitude:-8.6705,longitude:115.2126})
 assert.equal(parseLocationInput('https://www.google.com/maps/place/Villa/@-8.7,115.3,16z'),null)
 for(const input of ['https://evil.example/maps?q=-8,115','javascript:alert(1)','https://maps.app.goo.gl/example','91,180','https://www.google.com/maps/%zz'])assert.equal(parseLocationInput(input),null)
})
test('directions preserve the pinned destination, with address fallback only when a pin is absent',()=>{
 const pinned=new URL(directionsUrl({latitude:'-8.6705000',longitude:'115.2126000'},'Wrong address'))
 assert.equal(pinned.origin,'https://www.google.com')
 assert.equal(pinned.searchParams.get('api'),'1')
 assert.equal(pinned.searchParams.get('destination'),'-8.6705,115.2126')
 assert.equal(new URL(directionsUrl(null,'Villa Jasmine, Bali')).searchParams.get('destination'),'Villa Jasmine, Bali')
 assert.equal(directionsUrl(null,''),null)
})
