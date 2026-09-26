import { inArray } from 'drizzle-orm'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { listMaster } from '../repositories/master.repository.js'
import { permit, ADMIN_ROLES } from '../utils/auth.js'
import { billingPolicy } from './billing-settings.service.js'
export async function orderOptions(user) {
  permit(user, ADMIN_ROLES)
  const [customers, locations, services, billing] = await Promise.all([listMaster('customers',user),listMaster('locations',user),listMaster('services',user),billingPolicy()])
  const addresses=customers.length?await db.select().from(s.customerAddresses).where(inArray(s.customerAddresses.customerId,customers.map(c=>c.id))):[]
  return {customers:customers.map(c=>({id:c.id,name:c.name,phone:c.phone,addresses:addresses.filter(a=>a.customerId===c.id)})),locations,services,billing}
}
