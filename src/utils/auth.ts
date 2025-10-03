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

/**
 * Utility for resolving Shopify credentials from multiple sources
 */
export class CredentialResolver {
  /**
   * Resolves credentials from CLI options and environment variables
   * Priority: CLI options override environment variables
   */
  static resolve(options: { site?: string; accessToken?: string }): ShopifyCredentials {
    const envCredentials = getCredentialsFromEnv();

    let finalSite = options.site;
    let finalAccessToken = options.accessToken;

    // Use environment variables as fallback
    if (!finalSite || !finalAccessToken) {
      if (envCredentials) {
        finalSite = finalSite || envCredentials.site;
        finalAccessToken = finalAccessToken || envCredentials.accessToken;
      }
    }

    // Validate that we have both credentials
    if (!finalSite || !finalAccessToken) {
      throw new Error('Missing credentials. Provide either:\n' +
        '1. CLI arguments: --site <domain> --access-token <token>\n' +
        '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    return {
      site: finalSite,
      accessToken: finalAccessToken
    };
  }

  /**
   * Validates required option properties
   */
  static validateRequiredOptions(options: any, requiredProps: string[]): void {
    const missing = requiredProps.filter(prop => !options[prop]);

    if (missing.length > 0) {
      const examples = missing.map(prop => {
        const kebabCase = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `--${kebabCase} <value>`;
      }).join(' ');

      throw new Error(`Missing required options. Use: ${examples}`);
    }
  }
}
