/**
 * Authentication Test Suite
 * 
 * Tests the ShopifyAuth class with real API calls (no mocks).
 * Requires environment variables - see README.md for setup instructions.
 */

import { ShopifyAuth } from '../src/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

// Test configuration
const TEST_CREDENTIALS_DIR = path.join(process.cwd(), '.shopify-admin-cli-test');

// Colors for console output
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration: number;
}

class AuthTestSuite {
    private results: TestResult[] = [];
    private auth: ShopifyAuth;

    constructor() {
        // Create test instance with custom credentials dir
        this.auth = new (class extends ShopifyAuth {
            constructor() {
                super();
                // Override credentials directory for testing
                (this as any).credentialsDir = TEST_CREDENTIALS_DIR;
            }
        })();
    }

    /**
     * Run all authentication tests
     */
    async runAllTests(): Promise<void> {
        console.log(`${colors.bold}${colors.blue}🧪 Shopify Auth Test Suite${colors.reset}\n`);

        // Cleanup before tests
        await this.cleanup();

        // Environment validation tests
        await this.testEnvironmentSetup();

        // Authentication method tests
        await this.testEnvironmentAuthentication();
        await this.testInteractiveAuthentication();
        await this.testInvalidCredentials();

        // Store management tests
        await this.testListStores();
        await this.testLoadCredentials();

        // File operations tests
        await this.testCredentialsPersistence();

        // Cleanup after tests
        await this.cleanup();

        // Print summary
        this.printSummary();
    }

    /**
     * Test 1: Environment Setup Validation
     */
    private async testEnvironmentSetup(): Promise<void> {
        const testName = 'Environment Setup Validation';
        const start = Date.now();

        try {
            const hasTestCreds = this.hasTestCredentials();
            const hasSingleStoreCreds = this.hasSingleStoreCredentials();

            if (!hasTestCreds && !hasSingleStoreCreds) {
                throw new Error('Missing required environment variables. Set either:\n' +
                    '1. TEST_* variables: TEST_SHOPIFY_STORE_DOMAIN, TEST_SHOPIFY_API_KEY, TEST_SHOPIFY_API_SECRET\n' +
                    '2. Or SHOPIFY_* variables: SHOPIFY_STORE_DOMAIN, SHOPIFY_API_KEY, SHOPIFY_API_SECRET');
            }

            this.recordResult(testName, true,
                `✅ Environment configured: ${hasTestCreds ? 'TEST_* vars' : 'SHOPIFY_* vars'}`,
                Date.now() - start);

        } catch (error: any) {
            this.recordResult(testName, false, error.message, Date.now() - start);
        }
    }

    /**
     * Test 2: Environment Variable Authentication
     */
    private async testEnvironmentAuthentication(): Promise<void> {
        const testName = 'Environment Authentication';
        const start = Date.now();

        try {
            let testSite: string;

            // Try TEST_ variables first, fallback to SHOPIFY_ variables
            if (this.hasTestCredentials()) {
                testSite = process.env.TEST_SHOPIFY_STORE_DOMAIN!;
            } else if (this.hasSingleStoreCredentials()) {
                testSite = process.env.SHOPIFY_STORE_DOMAIN!;
            } else {
                throw new Error('No environment credentials available for testing');
            }

            const credentials = await this.auth.authenticate({ site: testSite });

            if (!credentials.site || !credentials.apiKey || !credentials.apiSecret) {
                throw new Error('Incomplete credentials returned');
            }

            this.recordResult(testName, true,
                `✅ Successfully authenticated with ${credentials.site} via environment`,
                Date.now() - start);

        } catch (error: any) {
            this.recordResult(testName, false,
                `❌ Environment auth failed: ${error.message}`,
                Date.now() - start);
        }
    }

    /**
     * Test 3: Interactive Authentication (with explicit credentials)
     */
    private async testInteractiveAuthentication(): Promise<void> {
        const testName = 'Interactive Authentication';
        const start = Date.now();

        try {
            const testCreds = this.getTestCredentials();
            if (!testCreds) {
                throw new Error('No test credentials available');
            }

            const credentials = await this.auth.authenticate({
                site: testCreds.site,
                apiKey: testCreds.apiKey,
                apiSecret: testCreds.apiSecret
            });

            if (credentials.site !== testCreds.site) {
                throw new Error('Site mismatch in returned credentials');
            }

            this.recordResult(testName, true,
                `✅ Interactive auth successful for ${credentials.site}`,
                Date.now() - start);

        } catch (error: any) {
            this.recordResult(testName, false,
                `❌ Interactive auth failed: ${error.message}`,
                Date.now() - start);
        }
    }

    /**
     * Test 4: Invalid Credentials Handling
     */
    private async testInvalidCredentials(): Promise<void> {
        const testName = 'Invalid Credentials Handling';
        const start = Date.now();

        try {
            await this.auth.authenticate({
                site: 'fake-store.myshopify.com',
                apiKey: 'fake-key',
                apiSecret: 'fake-secret'
            });

            // If we get here, the test failed (should have thrown)
            this.recordResult(testName, false,
                '❌ Should have rejected invalid credentials',
                Date.now() - start);

        } catch (error: any) {
            // Expected to throw an error
            if (error.message.includes('Invalid credentials') || error.message.includes('API access denied')) {
                this.recordResult(testName, true,
                    '✅ Correctly rejected invalid credentials',
                    Date.now() - start);
            } else {
                this.recordResult(testName, false,
                    `❌ Unexpected error: ${error.message}`,
                    Date.now() - start);
            }
        }
    }

    /**
     * Test 5: List Stores Functionality
     */
    private async testListStores(): Promise<void> {
        const testName = 'List Stores';
        const start = Date.now();

        try {
            // First authenticate to ensure we have at least one store
            const testCreds = this.getTestCredentials();
            if (testCreds) {
                await this.auth.authenticate(testCreds);
            }

            const stores = this.auth.listStores();

            if (!Array.isArray(stores)) {
                throw new Error('listStores should return an array');
            }

            if (stores.length === 0) {
                this.recordResult(testName, true,
                    '⚠️  No stores found (this may be expected)',
                    Date.now() - start);
            } else {
                const storeInfo = stores.map(s => `${s.site} (${s.source})`).join(', ');
                this.recordResult(testName, true,
                    `✅ Found ${stores.length} store(s): ${storeInfo}`,
                    Date.now() - start);
            }

        } catch (error: any) {
            this.recordResult(testName, false,
                `❌ List stores failed: ${error.message}`,
                Date.now() - start);
        }
    }

    /**
     * Test 6: Load Credentials
     */
    private async testLoadCredentials(): Promise<void> {
        const testName = 'Load Credentials';
        const start = Date.now();

        try {
            const testCreds = this.getTestCredentials();
            if (!testCreds) {
                throw new Error('No test credentials available');
            }

            // First save credentials
            await this.auth.authenticate(testCreds);

            // Then try to load them
            const loaded = await this.auth.loadCredentials(testCreds.site);

            if (!loaded) {
                throw new Error('Failed to load saved credentials');
            }

            if (loaded.site !== testCreds.site || loaded.apiKey !== testCreds.apiKey) {
                throw new Error('Loaded credentials do not match saved credentials');
            }

            this.recordResult(testName, true,
                `✅ Successfully loaded credentials for ${loaded.site}`,
                Date.now() - start);

        } catch (error: any) {
            this.recordResult(testName, false,
                `❌ Load credentials failed: ${error.message}`,
                Date.now() - start);
        }
    }

    /**
     * Test 7: Credentials Persistence
     */
    private async testCredentialsPersistence(): Promise<void> {
        const testName = 'Credentials Persistence';
        const start = Date.now();

        try {
            const testCreds = this.getTestCredentials();
            if (!testCreds) {
                throw new Error('No test credentials available');
            }

            // Authenticate and save
            await this.auth.authenticate(testCreds);

            // Check if file exists
            const storeName = testCreds.site.replace('.myshopify.com', '');
            const credentialsPath = path.join(TEST_CREDENTIALS_DIR, storeName);

            if (!fs.existsSync(credentialsPath)) {
                throw new Error('Credentials file was not created');
            }

            // Verify file contents
            const fileData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            if (fileData.site !== testCreds.site) {
                throw new Error('Saved credentials do not match expected values');
            }

            this.recordResult(testName, true,
                `✅ Credentials properly persisted to ${credentialsPath}`,
                Date.now() - start);

        } catch (error: any) {
            this.recordResult(testName, false,
                `❌ Persistence test failed: ${error.message}`,
                Date.now() - start);
        }
    }

    /**
     * Helper: Check if test credentials are available
     */
    private hasTestCredentials(): boolean {
        return !!(
            process.env.TEST_SHOPIFY_STORE_DOMAIN &&
            process.env.TEST_SHOPIFY_API_KEY &&
            process.env.TEST_SHOPIFY_API_SECRET
        );
    }

    /**
     * Helper: Check if single store credentials are available
     */
    private hasSingleStoreCredentials(): boolean {
        return !!(
            process.env.SHOPIFY_STORE_DOMAIN &&
            process.env.SHOPIFY_API_KEY &&
            process.env.SHOPIFY_API_SECRET
        );
    }

    /**
     * Helper: Get test credentials from environment
     */
    private getTestCredentials(): { site: string; apiKey: string; apiSecret: string } | null {
        if (this.hasTestCredentials()) {
            return {
                site: process.env.TEST_SHOPIFY_STORE_DOMAIN!,
                apiKey: process.env.TEST_SHOPIFY_API_KEY!,
                apiSecret: process.env.TEST_SHOPIFY_API_SECRET!
            };
        }

        if (this.hasSingleStoreCredentials()) {
            return {
                site: process.env.SHOPIFY_STORE_DOMAIN!,
                apiKey: process.env.SHOPIFY_API_KEY!,
                apiSecret: process.env.SHOPIFY_API_SECRET!
            };
        }

        return null;
    }

    /**
     * Helper: Record test result
     */
    private recordResult(name: string, passed: boolean, message: string, duration: number): void {
        this.results.push({ name, passed, message, duration });

        const status = passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
        const time = `${colors.yellow}${duration}ms${colors.reset}`;

        console.log(`[${status}] ${name} (${time})`);
        console.log(`      ${message}\n`);
    }

    /**
     * Helper: Cleanup test files
     */
    private async cleanup(): Promise<void> {
        if (fs.existsSync(TEST_CREDENTIALS_DIR)) {
            fs.rmSync(TEST_CREDENTIALS_DIR, { recursive: true, force: true });
        }
    }

    /**
     * Helper: Print test summary
     */
    private printSummary(): void {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

        console.log(`${colors.bold}📊 Test Summary${colors.reset}`);
        console.log(`Total: ${total} | ${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}`);
        console.log(`Total time: ${totalTime}ms\n`);

        if (failed > 0) {
            console.log(`${colors.red}❌ Failed Tests:${colors.reset}`);
            this.results.filter(r => !r.passed).forEach(result => {
                console.log(`   • ${result.name}: ${result.message}`);
            });
            console.log('');
        }

        // Exit with error code if any tests failed
        if (failed > 0) {
            process.exit(1);
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const testSuite = new AuthTestSuite();
    testSuite.runAllTests().catch(error => {
        console.error(`${colors.red}❌ Test suite failed:${colors.reset}`, error);
        process.exit(1);
    });
}

export { AuthTestSuite };
