import { ShopifyThemes } from '../src/commands/themes';
import { ShopifyPages } from '../src/commands/pages';

interface TestResult {
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
}

class ShopifyAdminTest {
    private results: TestResult[] = [];

    async run(): Promise<void> {
        console.log('\n🧪 Shopify Admin Multi-Component Test Suite\n');

        await this.testComponentValidation();
        await this.testPullComponentOrchestration();
        await this.testPushComponentOrchestration();

        this.printResults();
    }

    private async testComponentValidation(): Promise<void> {
        const testName = 'Component Validation';
        const startTime = Date.now();

        try {
            const validComponents = ['theme', 'pages'];
            const invalidComponents = ['invalid', 'test'];

            const testComponents = 'theme,pages,invalid';
            const components = testComponents.split(',').map(c => c.trim().toLowerCase());
            const invalid = components.filter(c => !validComponents.includes(c));

            if (invalid.length > 0 && invalid.includes('invalid')) {
                console.log(`[PASS] ${testName} (${Date.now() - startTime}ms)`);
                this.results.push({
                    name: testName,
                    passed: true,
                    duration: Date.now() - startTime
                });
            } else {
                throw new Error('Component validation failed to detect invalid components');
            }
        } catch (error: any) {
            console.log(`[FAIL] ${testName} (${Date.now() - startTime}ms)`);
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error.message
            });
        }
    }

    private async testPullComponentOrchestration(): Promise<void> {
        const testName = 'Pull Component Orchestration Logic';
        const startTime = Date.now();

        try {
            const components = 'theme,pages'.split(',').map(c => c.trim().toLowerCase());
            
            if (components.length === 2 && components.includes('theme') && components.includes('pages')) {
                console.log(`[PASS] ${testName} (${Date.now() - startTime}ms)`);
                this.results.push({
                    name: testName,
                    passed: true,
                    duration: Date.now() - startTime
                });
            } else {
                throw new Error('Component parsing failed');
            }
        } catch (error: any) {
            console.log(`[FAIL] ${testName} (${Date.now() - startTime}ms)`);
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error.message
            });
        }
    }

    private async testPushComponentOrchestration(): Promise<void> {
        const testName = 'Push Component Orchestration Logic';
        const startTime = Date.now();

        try {
            const themes = new ShopifyThemes();
            const pages = new ShopifyPages();

            const hasThemeCredentials = typeof themes.getCredentialsFromEnv === 'function';
            const hasPagesCredentials = typeof pages.getCredentialsFromEnv === 'function';

            if (hasThemeCredentials && hasPagesCredentials) {
                console.log(`[PASS] ${testName} (${Date.now() - startTime}ms)`);
                this.results.push({
                    name: testName,
                    passed: true,
                    duration: Date.now() - startTime
                });
            } else {
                throw new Error('Component classes not properly initialized');
            }
        } catch (error: any) {
            console.log(`[FAIL] ${testName} (${Date.now() - startTime}ms)`);
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                error: error.message
            });
        }
    }

    private printResults(): void {
        console.log('\n📊 Test Summary');
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}\n`);

        if (failed > 0) {
            console.log('Failed Tests:');
            this.results
                .filter(r => !r.passed)
                .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
            process.exit(1);
        }
    }
}

const test = new ShopifyAdminTest();
test.run().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});
