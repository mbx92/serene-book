import sharp from 'sharp'
import { ensure, fail } from './errors.js'
import { BRAND_IMAGE_MAX_BYTES } from '#shared/utils/branding.js'

export async function normalizeBrandImage(value, size) {
  if (value === null) return null
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  ensure(match, 400, 'Gunakan gambar PNG, JPG, atau WebP')
  const input = Buffer.from(match[2], 'base64')
  ensure(input.length <= BRAND_IMAGE_MAX_BYTES, 400, 'Ukuran gambar maksimal 2 MB')
  try {
    const image = sharp(input, { limitInputPixels: 16000000 })
    const metadata = await image.metadata()
    ensure(['png', 'jpeg', 'webp'].includes(metadata.format) && (metadata.pages || 1) === 1, 400, 'Gunakan gambar statis PNG, JPG, atau WebP')
    const output = await image.rotate().resize(size, size, { fit: 'contain', background: '#ffffff00' }).png().toBuffer()
    return `data:image/png;base64,${output.toString('base64')}`
  } catch (error) {
    if (error.statusCode) throw error
    fail(400, 'Gambar tidak dapat dibaca atau resolusinya terlalu besar')
  }
}
