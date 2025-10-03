import { CredentialResolver } from '../utils/auth';
import { Logger } from '../utils/logger';

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
  async validate(site?: string, accessToken?: string): Promise<ValidationResult> {
    // Get credentials using priority: 1. CLI args, 2. env vars, 3. error
    const credentials = CredentialResolver.resolve({ site, accessToken });
    return await this.validateWithGraphQL(credentials.site, credentials.accessToken);
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

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('fetch')) {
        throw new Error(`Network error: ${message}`);
      }
      throw error;
    }
  }
}

export async function authValidateCommand(site?: string, accessToken?: string): Promise<void> {
  const auth = new ShopifyAuth();

  try {
    const result = await auth.validate(site, accessToken);

    Logger.success(`Valid credentials for: ${result.shop.name}`);
    Logger.info(`Store domain: ${result.shop.domain}`);

    if (result.scopes && result.scopes.length > 0) {
      Logger.info(`Granted scopes (${result.scopes.length}):`);
      result.scopes.forEach(scope => Logger.info(`  ${scope}`));
    } else {
      Logger.info('No scopes granted');
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.error(`Validation failed: ${message}`);
    process.exit(1);
  }
}
