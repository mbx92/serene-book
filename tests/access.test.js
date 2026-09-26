import test from 'node:test'
import assert from 'node:assert/strict'
import { locationAdminPageAllowed, locationAdminApiAllowed } from '../shared/utils/access.js'
test('admin page restrictions match complete route segments and nested operational pages',()=>{
 for(const path of ['/dashboard','/orders','/orders/12/edit','/therapists/new','/therapists/1','/dispatch'])assert(locationAdminPageAllowed(path))
 for(const path of ['/payments','/reports/revenue','/users','/settings','/customers/new','/locations','/services/1/edit','/schedules','/orders-archive','/therapists-other'])assert(!locationAdminPageAllowed(path))
})
test('admin API access excludes financial and master modules even with nested paths',()=>{
 for(const resource of ['payments','reports','users','audit','customers','locations','services','schedules'])for(const method of ['GET','POST','PATCH','DELETE'])assert(!locationAdminApiAllowed(method,[resource,'1','refund']))
 assert(locationAdminApiAllowed('GET',['settings','billing']))
 assert(!locationAdminApiAllowed('PATCH',['settings','billing']))
 assert(!locationAdminApiAllowed('GET',['settings','revenue-sharing']))
 assert(locationAdminApiAllowed('PATCH',['therapists','1','schedules','5']))
})
