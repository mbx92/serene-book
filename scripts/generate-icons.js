import sharp from 'sharp'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

// Generate browser and installation icons from the application flower logo.
const root = new URL('../public/', import.meta.url)
const source = await readFile(new URL('favicon.svg', root), 'utf8')
await mkdir(new URL('icons/', root), { recursive: true })
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(new URL(`icons/${name}.png`, root).pathname)
}
// Keep the logo inside the maskable safe zone on a solid background.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#faf9f5"/><g transform="translate(48 48) scale(.625)">${source.replace(/<svg[^>]*>|<\/svg>/g, '')}</g></svg>`
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(new URL('icons/icon-maskable-512.png', root).pathname)

const sizes = [16, 32, 48]
const frames = await Promise.all(sizes.map(size => sharp(Buffer.from(source)).resize(size, size).png().toBuffer()))
const header = Buffer.alloc(6 + sizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(sizes.length, 4)
let offset = header.length
frames.forEach((frame, index) => {
  const entry = 6 + index * 16
  header[entry] = sizes[index]
  header[entry + 1] = sizes[index]
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
})
await writeFile(new URL('favicon.ico', root), Buffer.concat([header, ...frames]))
console.log('Generated flower favicon and PWA icons.')
