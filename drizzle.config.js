import { defineConfig } from 'drizzle-kit'
export default defineConfig({ schema: './server/database/schema/*.js', out: './server/database/migrations', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL } })
