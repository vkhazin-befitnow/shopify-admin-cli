export interface ShopifyCredentials {
  site: string;
  accessToken: string;
}

export function getCredentialsFromEnv(): ShopifyCredentials | null {
  const site = process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (site && accessToken) {
    return { site, accessToken };
  }

  return null;
}
