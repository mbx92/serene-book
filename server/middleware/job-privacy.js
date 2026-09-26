import { defineEventHandler, setResponseHeader } from 'h3'
export default defineEventHandler(event => {
  if (event.path.startsWith('/job/')) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'strict-origin')
    setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow, nosnippet')
  }
})
