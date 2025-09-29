/**
 * Shopify Admin API configuration
 * For use with access tokens (not OAuth flow)
 */
export const SHOPIFY_API = {
  VERSION: '2023-10',
  BASE_URL: (site: string) => `https://${site}/admin/api`,
  ENDPOINTS: {
    THEMES: 'themes.json',
    THEME_BY_ID: (themeId: number) => `themes/${themeId}.json`,
    THEME_ASSETS: (themeId: number) => `themes/${themeId}/assets.json`,
    THEME_ASSET: (themeId: number, assetKey: string) =>
      `themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`
  },
  RETRY_CONFIG: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000
  }
};
