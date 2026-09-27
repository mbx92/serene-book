import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { db } from '../database/index.js'
import * as s from '../database/schema/index.js'
import { permit, OWNER_ROLES } from '../utils/auth.js'
import { normalizeBrandImage } from '../utils/brand-image.js'
import { DEFAULT_APP_NAME, DEFAULT_LOGO, DEFAULT_FAVICON } from '#shared/utils/branding.js'

export async function brandingSettings() {
  const [row] = await db.select().from(s.appBranding).where(eq(s.appBranding.id, 1))
  return row || { appName: DEFAULT_APP_NAME, logo: null, favicon: null, updatedAt: null }
}
export function publicBranding(settings) {
  const version = settings.updatedAt ? new Date(settings.updatedAt).getTime() : 0
  return { appName: settings.appName, logoUrl: settings.logo ? `/api/public/branding-icon/logo?v=${version}` : DEFAULT_LOGO, faviconUrl: settings.favicon ? `/api/public/branding-icon/favicon?v=${version}` : DEFAULT_FAVICON, version, customFavicon: !!settings.favicon }
}
export async function getBrandingSettings(user) {
  permit(user, OWNER_ROLES)
  const settings = await brandingSettings()
  return { appName: settings.appName, logo: settings.logo, favicon: settings.favicon }
}
export async function saveBrandingSettings(input, user) {
  permit(user, OWNER_ROLES)
  const logo = await normalizeBrandImage(input.logo, 512)
  const favicon = await normalizeBrandImage(input.favicon, 512)
  return db.transaction(async tx => {
    const values = { appName: input.appName, logo, favicon, updatedBy: user.id, updatedAt: new Date() }
    const [saved] = await tx.insert(s.appBranding).values({ id: 1, ...values }).onConflictDoUpdate({ target: s.appBranding.id, set: values }).returning()
    await tx.insert(s.auditLogs).values({ userId: user.id, action: 'APP_BRANDING_UPDATED', entity: 'app_branding', entityId: 1, data: { appName: input.appName, customLogo: !!logo, customFavicon: !!favicon } })
    return { appName: saved.appName, logo: saved.logo, favicon: saved.favicon, branding: publicBranding(saved) }
  })
}
export function brandingManifest(settings) {
  const { version } = publicBranding(settings)
  const icon = settings.favicon
  return { id: '/', name: settings.appName, short_name: settings.appName, description: 'Booking treatment dan pengelolaan pelayanan spa.', lang: 'id', start_url: '/', scope: '/', display: 'standalone', background_color: '#faf9f5', theme_color: '#315b49', icons: [
    { src: icon ? `/api/public/branding-icon/192?v=${version}` : '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: icon ? `/api/public/branding-icon/512?v=${version}` : '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: icon ? `/api/public/branding-icon/maskable?v=${version}` : '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ] }
}
export async function brandingIcon(settings, kind) {
  const value = kind === 'logo' ? settings.logo : settings.favicon
  if (!value) return null
  const size = kind === '192' ? 192 : kind === 'favicon' ? 64 : kind === 'apple' ? 180 : 512
  const input = Buffer.from(value.split(',')[1], 'base64')
  const image = sharp(input).resize(kind === 'maskable' ? 320 : size, kind === 'maskable' ? 320 : size)
  return kind === 'maskable' ? image.extend({ top: 96, bottom: 96, left: 96, right: 96, background: '#faf9f5' }).flatten({ background: '#faf9f5' }).png().toBuffer() : image.png().toBuffer()
}
