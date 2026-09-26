import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema/index.js'
import { databaseURL } from './config.js'
export const pool = new pg.Pool({ connectionString: databaseURL(), max: 10 })
export const db = drizzle(pool, { schema })
