/**
 * Products Test Suite
 * 
 * Tests the ShopifyProducts class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyProducts, productsPullCommand, productsPushCommand } from '../src/commands/products';

const TEST_RUN_DIR = path.join(__dirname, 'test-run');

function hasCredentials(): boolean {
    return !!(
        process.env.SHOPIFY_STORE_DOMAIN &&
        process.env.SHOPIFY_ACCESS_TOKEN
    );
}

function getCredentials(): { site: string; accessToken: string } | null {
    if (hasCredentials()) {
        return {
            site: process.env.SHOPIFY_STORE_DOMAIN!,
            accessToken: process.env.SHOPIFY_ACCESS_TOKEN!
        };
    }
    return null;
}

function cleanupTestDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

describe('Shopify Products', () => {
    const products = new ShopifyProducts();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Products Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-pull-test');
        cleanupTestDirectory(testProductsPath);

        await products.pull(testProductsPath, creds.site, creds.accessToken, 3);

        const actualProductsPath = path.join(testProductsPath, 'products');

        assert.ok(fs.existsSync(actualProductsPath), 'Products folder should exist');

        const jsonFiles = fs.readdirSync(actualProductsPath).filter(file => file.endsWith('.json'));
        assert.ok(jsonFiles.length > 0, 'Should download at least some product files');
        assert.ok(jsonFiles.length <= 3, 'Should respect the limit of 3 products');

        if (jsonFiles.length > 0) {
            const firstProductPath = path.join(actualProductsPath, jsonFiles[0]);
            const content = fs.readFileSync(firstProductPath, 'utf8');
            const productData = JSON.parse(content);

            assert.ok(productData.title, 'Product should have title');
            assert.ok(productData.variants, 'Product should have variants');
        }

        console.log(`Successfully pulled ${jsonFiles.length} products with limit`);
    });

    test('Products Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-pull-dry-run-test');
        cleanupTestDirectory(testProductsPath);

        await products.pull(testProductsPath, creds.site, creds.accessToken, 2, true);

        assert.ok(!fs.existsSync(testProductsPath) || fs.readdirSync(testProductsPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Products Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-pull-mirror-test');
        cleanupTestDirectory(testProductsPath);

        const actualProductsPath = path.join(testProductsPath, 'products');

        fs.mkdirSync(actualProductsPath, { recursive: true });
        fs.writeFileSync(path.join(actualProductsPath, 'local-only-product.json'), JSON.stringify({ title: 'Local Only' }, null, 2));

        await products.pull(testProductsPath, creds.site, creds.accessToken, 2, false, true);

        assert.ok(!fs.existsSync(path.join(actualProductsPath, 'local-only-product.json')), 'Local-only product should be deleted in mirror mode');

        console.log('Mirror mode pull completed successfully');
    });

    test('Products Push Should Update Existing Products Not Create Duplicates', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-update-test');
        cleanupTestDirectory(testProductsPath);

        await products.pull(testProductsPath, creds.site, creds.accessToken, 1);

        const actualProductsPath = path.join(testProductsPath, 'products');
        const jsonFiles = fs.readdirSync(actualProductsPath).filter(file => file.endsWith('.json'));

        assert.ok(jsonFiles.length > 0, 'Should have at least one product to test with');

        const testProductFile = jsonFiles[0];
        const testProductHandle = testProductFile.replace('.json', '');
        const testProductPath = path.join(actualProductsPath, testProductFile);

        const remoteProductsBefore = await products['fetchProducts'](creds.site, creds.accessToken);
        const productsWithHandleBefore = remoteProductsBefore.filter(p => p.handle === testProductHandle);
        const initialCount = productsWithHandleBefore.length;

        console.log(`Initial: Found ${initialCount} product(s) with handle "${testProductHandle}"`);
        assert.strictEqual(initialCount, 1, `Should have exactly 1 product with handle "${testProductHandle}" before push`);

        const productData = JSON.parse(fs.readFileSync(testProductPath, 'utf8'));
        productData.body_html = (productData.body_html || '') + `\n<!-- Modified at ${new Date().toISOString()} -->`;
        fs.writeFileSync(testProductPath, JSON.stringify(productData, null, 2));

        await products.push(testProductsPath, creds.site, creds.accessToken, false);

        const remoteProductsAfter = await products['fetchProducts'](creds.site, creds.accessToken);
        const productsWithHandleAfter = remoteProductsAfter.filter(p => p.handle === testProductHandle);
        const finalCount = productsWithHandleAfter.length;

        console.log(`After push: Found ${finalCount} product(s) with handle "${testProductHandle}"`);

        assert.strictEqual(
            finalCount,
            initialCount,
            `Should still have ${initialCount} product(s) with handle "${testProductHandle}" after push (not ${finalCount})`
        );

        const updatedProduct = productsWithHandleAfter[0];
        assert.ok(
            updatedProduct.body_html?.includes(`Modified at`),
            'Product content should be updated with the modified timestamp'
        );

        console.log('Successfully verified push updates existing products without creating duplicates');
    });

    test('Products Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-push-dry-run-test');
        cleanupTestDirectory(testProductsPath);

        await products.pull(testProductsPath, creds.site, creds.accessToken, 2);

        await assert.doesNotReject(
            async () => {
                await products.push(testProductsPath, creds.site, creds.accessToken, true);
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-pull-command-test');
        cleanupTestDirectory(testProductsPath);

        await assert.doesNotReject(
            async () => {
                await productsPullCommand({
                    output: testProductsPath,
                    dryRun: true,
                    mirror: true,
                    maxProducts: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Push Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testProductsPath = path.join(TEST_RUN_DIR, 'products-push-command-test');
        cleanupTestDirectory(testProductsPath);

        const actualProductsPath = path.join(testProductsPath, 'products');
        fs.mkdirSync(actualProductsPath, { recursive: true });

        const testProductData = {
            title: 'Command Test Product',
            body_html: '<p>Test product for command testing</p>',
            vendor: 'Test Vendor',
            product_type: 'Test Type',
            variants: [
                {
                    title: 'Default',
                    price: '10.00',
                    sku: 'TEST-SKU'
                }
            ]
        };

        fs.writeFileSync(path.join(actualProductsPath, 'command-test-product.json'), JSON.stringify(testProductData, null, 2));

        await assert.doesNotReject(
            async () => {
                await productsPushCommand({
                    input: testProductsPath,
                    dryRun: true,
                    mirror: false,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle parameters correctly'
        );

        console.log('Push command with parameters completed successfully');
    });
});

console.log('Running Products Test Suite...\n');
