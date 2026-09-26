import argon2 from 'argon2'
import { eq, and } from 'drizzle-orm'
import { DateTime } from 'luxon'
import { db, pool } from '../server/database/index.js'
import * as s from '../server/database/schema/index.js'
import { createOrder, transitionOrder, assignLocation, assignTherapist, recordPayment } from '../server/services/order.service.js'
const password = process.env.SEED_PASSWORD
if (!password || password.length < 10) throw new Error('Set SEED_PASSWORD minimal 10 karakter sebelum melakukan seed.')
const now = DateTime.now().setZone('Asia/Makassar')
try {
  const [existing] = await db.select().from(s.users).limit(1)
  if (existing) { console.log('Seed dilewati: database sudah memiliki user. Tidak ada data yang ditimpa.'); process.exitCode = 0 }
  else {
    const roles = await db.insert(s.roles).values(['SUPER_ADMIN','OWNER','CUSTOMER_SERVICE','LOCATION_ADMIN','THERAPIST'].map(code => ({ code, name: code.replaceAll('_',' ') }))).returning()
    const locations = await db.insert(s.locations).values([{ name: 'Seminyak', code: 'SMY', address: 'Jl. Petitenget, Seminyak', phone: '+6281234567801' }, { name: 'Canggu', code: 'CGU', address: 'Jl. Batu Bolong, Canggu', phone: '+6281234567802' }, { name: 'Ubud', code: 'UBD', address: 'Jl. Raya Ubud', phone: '+6281234567803' }]).returning()
    const hash = await argon2.hash(password)
    async function account(name, email, role, locationId = null) {
      const [user] = await db.insert(s.users).values({ name, email, passwordHash: hash, phone: '+6281234567890' }).returning()
      await db.insert(s.userRoles).values({ userId: user.id, roleId: roles.find(r => r.code === role).id, locationId })
      return { ...user, role, locationId, locationIds: locationId ? [locationId] : [] }
    }
    const owner = await account('Nadia Putri', 'owner@serene.local', 'OWNER')
    await account('Dewi Lestari', 'cs@serene.local', 'CUSTOMER_SERVICE')
    await account('Bima Pratama', 'admin@serene.local', 'LOCATION_ADMIN', locations[0].id)
    const therapists = []
    for (const [i,name] of ['Ayu Pramesti','Made Sari','Putu Wulandari','Wayan Dewi','Komang Lestari','Ni Luh Ratih'].entries()) {
      const location = locations[Math.floor(i / 2)]
      const user = await account(name, `${name.split(' ')[0].toLowerCase()}@serene.local`, 'THERAPIST')
      const [therapist] = await db.insert(s.therapists).values({ userId: user.id, employeeCode: `TH-${String(i+1).padStart(3,'0')}`, gender: 'FEMALE', notes: 'Therapist profesional home service.' }).returning()
      user.therapistId = therapist.id
      await db.insert(s.therapistLocations).values({ therapistId: therapist.id, locationId: location.id, isPrimary: true })
      for (let day = -7; day <= 14; day++) await db.insert(s.therapistSchedules).values({ therapistId: therapist.id, locationId: location.id, scheduleDate: now.plus({days:day}).toISODate(), startTime: '08:00', endTime: '22:00', status: 'AVAILABLE' })
      therapists.push({ ...therapist, identity: user, locationId: location.id })
    }
    const services = []
    for (const [i,item] of [{ name:'Balinese Massage', duration:60, price:250000, description:'Pijatan tradisional Bali untuk relaksasi tubuh dan pikiran.' },{name:'Deep Tissue Massage', duration:90,price:375000,description:'Treatment intensif untuk meredakan ketegangan otot.'},{name:'Aromatherapy Massage',duration:90,price:350000,description:'Relaksasi menyeluruh dengan minyak aromaterapi.'},{name:'Foot Reflexology',duration:60,price:200000,description:'Refleksi kaki untuk memulihkan keseimbangan tubuh.'}].entries()) {
      const [service] = await db.insert(s.services).values({ name:item.name,code:`SVC-${i+1}`,description:item.description,durationMinutes:item.duration }).returning()
      await db.insert(s.servicePrices).values({serviceId:service.id,price:String(item.price) }); services.push(service)
    }
    const customers = await db.insert(s.customers).values(['Clara Williams','James Anderson','Sarah Mitchell','Michael Chen','Emma Wilson','Daniel Santoso','Olivia Brown','Sophie Laurent'].map((name,i) => ({ name, phone:`+628123456${String(i).padStart(4,'0')}`, email:`guest${i+1}@example.com`, notes:'Data contoh untuk pengujian operasional.', createdBy:owner.id }))).returning()
    for (const [i,c] of customers.entries()) await db.insert(s.customerAddresses).values({ customerId:c.id,label:'Villa',address:`Villa ${['Jasmine','Lotus','Palm','Bamboo'][i%4]}, Jl. Petitenget No. ${i+1}, Bali`,isDefault:true })
    async function sample(customer, therapist, date, time, stage, serviceIndex=0) {
      const order = await createOrder({customerId:customer.id,locationId:therapist?.locationId || null,bookingDate:date,bookingTime:time,address:`Villa ${customer.name.split(' ')[0]}, Jl. Petitenget, Bali`,services:[{serviceId:services[serviceIndex].id,qty:1}],discount:0,transportFee:25000,tax:0,source:'WHATSAPP',notes:'Mohon hubungi customer saat tiba.'},owner)
      if (stage === 'NEW') return order
      await transitionOrder(order.id,'confirm',owner)
      await assignLocation(order.id,therapist.locationId,owner)
      if (stage === 'ASSIGNED_LOCATION') return order
      await assignTherapist(order.id,therapist.id,owner)
      if (stage === 'ASSIGNED_THERAPIST') return order
      for (const action of ['accept','on-the-way','arrived','start','complete']) {
        await transitionOrder(order.id,action,therapist.identity)
        if ({accept:'ACCEPTED','on-the-way':'ON_THE_WAY',arrived:'ARRIVED',start:'IN_PROGRESS',complete:'COMPLETED'}[action] === stage) return order
        if (action === 'start') {
          // Historical demo jobs have already completed their treatment duration.
          const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id))
          const duration = items.reduce((n, item) => n + item.durationMinutes * item.qty, 0)
          await db.update(s.orderStatusLogs).set({ createdAt: new Date(Date.now() - duration * 60000) }).where(and(eq(s.orderStatusLogs.orderId, order.id), eq(s.orderStatusLogs.toStatus, 'IN_PROGRESS')))
        }
      }
      const [current] = await db.select().from(s.orders).where(eq(s.orders.id,order.id))
      const payment = await recordPayment({orderId:order.id,amount:Number(current.total),paymentMethod:'QRIS',paymentReference:`DEMO-${order.id}`},owner)
      await db.update(s.payments).set({ paidAt: DateTime.fromISO(`${date}T${time}`,{zone:'Asia/Makassar'}).toJSDate() }).where(eq(s.payments.id,payment.id))
      if (stage === 'CLOSED') await transitionOrder(order.id,'close',owner)
      return order
    }
    for (let d=-6; d<0; d++) for (let n=0;n<2+(Math.abs(d)%3);n++) await sample(customers[(Math.abs(d)+n)%customers.length],therapists[n%6],now.plus({days:d}).toISODate(),`${String(9+n*2).padStart(2,'0')}:00`,'CLOSED',n%4)
    const stages = ['PAID','IN_PROGRESS','ON_THE_WAY','ASSIGNED_LOCATION','ASSIGNED_THERAPIST','ACCEPTED','NEW','NEW']
    for (let i=0;i<8;i++) await sample(customers[i],therapists[i%6],now.toISODate(),`${String(9+i).padStart(2,'0')}:00`,stages[i],i%4)
    console.log('Seed selesai. Akun: owner@serene.local, cs@serene.local, admin@serene.local, ayu@serene.local. Password mengikuti SEED_PASSWORD.')
  }
} finally { await pool.end() }
