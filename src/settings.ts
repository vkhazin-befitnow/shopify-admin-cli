// Environment variables - centralized access point
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set. Please set it in your environment or .env file.`);
  }
  return value;
}

export const SHOPIFY_CLIENT_ID = getRequiredEnvVar('SHOPIFY_CLIENT_ID');
export const SHOPIFY_CLIENT_SECRET = getRequiredEnvVar('SHOPIFY_CLIENT_SECRET');

export const SHOPIFY_URLS = {
  PARTNER_OAUTH_AUTHORIZE: 'https://accounts.shopify.com/oauth/authorize',
  PARTNER_OAUTH_TOKEN: 'https://accounts.shopify.com/oauth/token',
  ADMIN_OAUTH_AUTHORIZE: (shop: string) => `https://${shop}/admin/oauth/authorize`,
  ADMIN_OAUTH_TOKEN: (shop: string) => `https://${shop}/admin/oauth/access_token`
};

export const OAUTH_CONFIG = {
  REDIRECT_PORT: 9000,
  REDIRECT_PATH: '/callback'
};

export const SHOPIFY_SCOPES = {
  PARTNER: 'https://api.shopify.com/auth/partners.app-api.access',
  ADMIN: [
    // Core store data
    'read_products', 'write_products',
    'read_product_listings', 'write_product_listings',
    'read_collections', 'write_collections',
    'read_orders', 'write_orders',
    'read_customers', 'write_customers',

    // Theme and assets
    'read_themes', 'write_themes',
    'read_content', 'write_content',
    'read_files', 'write_files',

    // Store configuration
    'read_script_tags', 'write_script_tags',
    'read_shipping', 'write_shipping',
    'read_locales', 'write_locales',
    'read_markets', 'write_markets',

    // Analytics and reports
    'read_analytics', 'read_reports',

    // Inventory and fulfillment
    'read_inventory', 'write_inventory',
    'read_locations', 'write_locations',
    'read_fulfillments', 'write_fulfillments',

    // Marketing and discounts
    'read_discounts', 'write_discounts',
    'read_marketing_events', 'write_marketing_events',
    'read_price_rules', 'write_price_rules',

    // Store settings and policies
    'read_shopify_payments_payouts',
    'read_shopify_payments_disputes',
    'read_legal_policies', 'write_legal_policies',

    // Third-party integrations
    'read_third_party_fulfillment_orders', 'write_third_party_fulfillment_orders',
    'read_assigned_fulfillment_orders', 'write_assigned_fulfillment_orders'
  ].join(',')
};
