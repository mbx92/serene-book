export function hasCoordinates(point) {
  if (!point || point.latitude === null || point.longitude === null || point.latitude === undefined || point.longitude === undefined || point.latitude === '' || point.longitude === '') return false
  if (![point.latitude, point.longitude].every(v => typeof v === 'number' || (typeof v === 'string' && v.trim() && /^-?\d+(?:\.\d+)?$/.test(v.trim())))) return false
  const latitude = Number(point.latitude)
  const longitude = Number(point.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
}
export function normalizeCoordinates(point) {
  if (!hasCoordinates(point)) return null
  return { latitude: Number(Number(point.latitude).toFixed(7)), longitude: Number(Number(point.longitude).toFixed(7)) }
}
function parsePair(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  return match ? normalizeCoordinates({ latitude: match[1], longitude: match[2] }) : null
}
export function parseLocationInput(value) {
  const coordinates = parsePair(value)
  if (coordinates) return coordinates
  let url
  try { url = new URL(value.trim()) } catch { return null }
  if (url.protocol !== 'https:' || !/^(?:(?:www|maps)\.)?google\.(?:com|co\.id|co\.uk|com\.au|co\.in|co\.jp)$/.test(url.hostname)) return null
  if (url.hostname !== 'maps.google.com' && !url.pathname.startsWith('/maps')) return null
  // Place coordinates identify the selected place; @ coordinates can be only the camera center.
  let data
  try { data = decodeURIComponent(url.pathname + url.search + url.hash) } catch { return null }
  const place = data.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (place) return normalizeCoordinates({ latitude: place[1], longitude: place[2] })
  for (const key of ['destination', 'query', 'q', 'll']) {
    const pair = parsePair(url.searchParams.get(key))
    if (pair) return pair
  }
  // An @ URL is accepted only for an explicit map center, never as a place/directions pin.
  if (!/\/maps\/(?:place|dir)\//.test(url.pathname)) {
    const center = data.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    if (center) return normalizeCoordinates({ latitude: center[1], longitude: center[2] })
  }
  return null
}
export function directionsUrl(point, address = '') {
  const coordinates = normalizeCoordinates(point)
  const destination = coordinates ? `${coordinates.latitude},${coordinates.longitude}` : address.trim()
  if (!destination) return null
  const query = new URLSearchParams({ api: '1', destination, travelmode: 'driving' })
  return `https://www.google.com/maps/dir/?${query}`
}
export function searchMapsUrl(address = 'Bali') {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: address.trim() || 'Bali' })}`
}
