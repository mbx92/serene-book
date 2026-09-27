import { DEFAULT_APP_NAME, DEFAULT_LOGO, DEFAULT_FAVICON } from '#shared/utils/branding.js'

export function useBranding() {
  return useState('app-branding', () => ({ appName: DEFAULT_APP_NAME, logoUrl: DEFAULT_LOGO, faviconUrl: DEFAULT_FAVICON, version: 0, customFavicon: false }))
}
