export function databaseURL(env = process.env) {
  if (env.DATABASE_URL || env.NUXT_DATABASE_URL) return env.DATABASE_URL || env.NUXT_DATABASE_URL
  if (!env.DATABASE_HOST || !env.DATABASE_USER || !env.DATABASE_PASSWORD || !env.DATABASE_NAME) throw new Error('Konfigurasi database belum lengkap')
  const url = new URL('postgresql://localhost')
  url.hostname = env.DATABASE_HOST; url.port = env.DATABASE_PORT || '5432'
  url.username = encodeURIComponent(env.DATABASE_USER); url.password = encodeURIComponent(env.DATABASE_PASSWORD)
  url.pathname = '/' + encodeURIComponent(env.DATABASE_NAME)
  return url.toString()
}
