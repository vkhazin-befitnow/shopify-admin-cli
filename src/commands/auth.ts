import { ShopifyAuth } from '../lib/auth';

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
