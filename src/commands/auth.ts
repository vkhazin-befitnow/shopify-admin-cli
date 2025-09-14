import { ShopifyAuth } from '../lib/auth';

export async function authLoginCommand(options: {
  site?: string;
  accessToken?: string;
}): Promise<void> {
  const auth = new ShopifyAuth();

  try {
    console.log('🔐 Starting Shopify authentication...');

    const credentials = await auth.authenticate(options);

    console.log(`✅ Successfully authenticated with ${credentials.site}`);
    console.log('\n💡 Tip: You can also use environment variables for CI/CD:');
    console.log('   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com');
    console.log('   SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx');

  } catch (error: any) {
    console.error(`❌ Authentication failed: ${error.message}`);
    console.error('\n📋 To create private app credentials:');
    console.error('1. Go to your Shopify store admin');
    console.error('2. Apps > App and sales channel settings > Develop apps');
    console.error('3. Create a private app with required API scopes');
    console.error('4. Install the app and copy the Admin API access token');
    process.exit(1);
  }
}

export async function authListCommand(): Promise<void> {
  const auth = new ShopifyAuth();
  const stores = auth.listStores();

  if (stores.length === 0) {
    console.log('📭 No authenticated stores found.');
    console.log('\n🚀 To authenticate:');
    console.log('   shopify-admin auth login --site STORE --access-token TOKEN');
    console.log('   or set environment variables (see help)');
    return;
  }

  console.log('🏪 Authenticated stores:');
  console.log('');

  stores.forEach(store => {
    const sourceIcon = store.source === 'environment' ? '🌍' : '💾';
    console.log(`   ${sourceIcon} ${store.site} (${store.source}) - ${store.authenticatedAt}`);
  });

  console.log('');
  console.log('Legend: 🌍 Environment variables | 💾 Stored credentials');
}

export async function authStatusCommand(site: string): Promise<void> {
  const auth = new ShopifyAuth();

  try {
    const credentials = await auth.loadCredentials(site);

    if (credentials) {
      console.log(`✅ Authenticated with ${credentials.site}`);
      console.log(`   Authenticated: ${credentials.authenticatedAt}`);
    } else {
      console.log(`❌ Not authenticated with ${site}`);
      console.log('Run: shopify-admin auth login --site ' + site);
    }
  } catch (error: any) {
    console.error(`Error checking authentication status: ${error.message}`);
    process.exit(1);
  }
}
