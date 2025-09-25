interface EnvStoreConfig {
  site: string;
  accessToken: string;
}

interface ValidationResult {
  shop: {
    name: string;
    domain: string;
  };
  scopes?: string[];
}

export class ShopifyAuth {
  constructor() {
  }

  /**
   * Validate credentials and list granted scopes using GraphQL
   */
  async validate(options?: {
    site?: string;
    accessToken?: string;
  }): Promise<ValidationResult> {

    // Get credentials using priority: 1. CLI args, 2. env vars, 3. error
    let site = options?.site;
    let accessToken = options?.accessToken;

    // If no explicit parameters provided, try environment variables
    if (!site || !accessToken) {
      const envCredentials = this.getCredentialsFromEnv();
      if (envCredentials) {
        site = site || envCredentials.site;
        accessToken = accessToken || envCredentials.accessToken;
      }
    }

    // Error if credentials are still missing
    if (!site || !accessToken) {
      throw new Error('Missing credentials. Provide either:\n' +
        '1. CLI arguments: --site <domain> --access-token <token>\n' +
        '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    // Validate using GraphQL to get both shop info and scopes
    return await this.validateWithGraphQL(site, accessToken);
  }

  /**
   * Validate credentials using GraphQL to get shop info and scopes
   */
  private async validateWithGraphQL(site: string, accessToken: string): Promise<ValidationResult> {
    const apiVersion = '2025-01';
    const url = `https://${site}/admin/api/${apiVersion}/graphql.json`;

    const query = `
            query {
                shop {
                    name
                    myshopifyDomain
                }
                currentAppInstallation {
                    accessScopes {
                        handle
                    }
                }
            }
        `;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (response.status === 401) {
        throw new Error('Unauthorized: invalid token or store domain');
      }

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${await response.text()}`);
      }

      const data = await response.json();

      if (data.errors && data.errors.length > 0) {
        throw new Error(`GraphQL errors: ${data.errors.map((e: any) => e.message).join(', ')}`);
      }

      if (!data.data || !data.data.shop) {
        throw new Error('Invalid response: missing shop data');
      }

      const result: ValidationResult = {
        shop: {
          name: data.data.shop.name,
          domain: data.data.shop.myshopifyDomain
        }
      };

      if (data.data.currentAppInstallation) {
        result.scopes = data.data.currentAppInstallation.accessScopes.map((scope: any) => scope.handle);
      }

      return result;

    } catch (error: any) {
      if (error.message.includes('fetch')) {
        throw new Error(`Network error: ${error.message}`);
      }
      throw error;
    }
  }

  private getCredentialsFromEnv(): EnvStoreConfig | null {
    const site = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (site && accessToken) {
      return { site, accessToken };
    }

    return null;
  }
}

export async function authValidateCommand(options: {
  site?: string;
  accessToken?: string;
}): Promise<void> {
  const auth = new ShopifyAuth();

  try {
    const result = await auth.validate(options);

    console.log(`Valid credentials for: ${result.shop.name}`);
    console.log(`Store domain: ${result.shop.domain}`);

    if (result.scopes && result.scopes.length > 0) {
      console.log(`Granted scopes (${result.scopes.length}):`);
      result.scopes.forEach(scope => console.log(`  ${scope}`));
    } else {
      console.log('No scopes granted');
    }

  } catch (error: any) {
    console.error(`Validation failed: ${error.message}`);
    process.exit(1);
  }
}
