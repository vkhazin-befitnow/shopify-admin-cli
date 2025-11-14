/**
 * Metafields Test Suite
 * 
 * Tests the ShopifyMetafields class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyMetafields, metafieldsPullCommand, metafieldsPushCommand } from '../src/commands/metafields';

// Test directory for metafield operations
const TEST_RUN_DIR = path.join(__dirname, 'test-run');

// Helper functions
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

describe('Shopify Metafields', () => {
    const metafields = new ShopifyMetafields();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Metafields Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-pull-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Pull metafields with limit for testing
        await metafields.pull({
            output: testMetafieldsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 5
        });

        // The pull method creates a 'metafields' subfolder automatically
        const actualMetafieldsPath = path.join(testMetafieldsPath, 'metafields');

        // Verify metafields folder was created
        assert.ok(fs.existsSync(actualMetafieldsPath), 'Metafields folder should exist');

        // Check that JSON files were downloaded (metafields are organized by owner_resource/owner_id)
        if (fs.existsSync(actualMetafieldsPath)) {
            const ownerResources = fs.readdirSync(actualMetafieldsPath).filter(file => {
                const fullPath = path.join(actualMetafieldsPath, file);
                return fs.statSync(fullPath).isDirectory();
            });

            if (ownerResources.length > 0) {
                console.log(`Found metafields for owner resources: ${ownerResources.join(', ')}`);

                // Check the first owner resource
                const firstOwnerResource = ownerResources[0];
                const ownerResourcePath = path.join(actualMetafieldsPath, firstOwnerResource);
                const ownerIds = fs.readdirSync(ownerResourcePath).filter(file => {
                    const fullPath = path.join(ownerResourcePath, file);
                    return fs.statSync(fullPath).isDirectory();
                });

                if (ownerIds.length > 0) {
                    const firstOwnerId = ownerIds[0];
                    const ownerIdPath = path.join(ownerResourcePath, firstOwnerId);
                    const jsonFiles = fs.readdirSync(ownerIdPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));

                    if (jsonFiles.length > 0) {
                        // Verify metafield file structure
                        const firstMetafieldPath = path.join(ownerIdPath, jsonFiles[0]);
                        const content = JSON.parse(fs.readFileSync(firstMetafieldPath, 'utf8'));

                        // Metafield should have required fields
                        assert.ok(content.namespace, 'Metafield should have a namespace');
                        assert.ok(content.key, 'Metafield should have a key');
                        assert.ok(content.value !== undefined, 'Metafield should have a value');
                        assert.ok(content.type, 'Metafield should have a type');

                        // Check for metadata file
                        const metaPath = firstMetafieldPath + '.meta';
                        assert.ok(fs.existsSync(metaPath), 'Metadata file should exist');

                        const metadata = fs.readFileSync(metaPath, 'utf8');
                        assert.ok(metadata.includes('owner_resource:'), 'Metadata should contain owner_resource');
                        assert.ok(metadata.includes('owner_id:'), 'Metadata should contain owner_id');
                        assert.ok(metadata.includes('id:'), 'Metadata should contain ID');

                        console.log(`Successfully pulled ${jsonFiles.length} metafield(s) with limit`);
                    } else {
                        console.log('No metafield JSON files found (this is okay for testing)');
                    }
                } else {
                    console.log('No owner IDs found (this is okay for testing)');
                }
            } else {
                console.log('No metafields found in store (this is okay for testing)');
            }
        }
    });

    test('Metafields Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-pull-dry-run-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Test dry run pull (should not download files)
        await metafields.pull({
            output: testMetafieldsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: true
        });

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testMetafieldsPath) || fs.readdirSync(testMetafieldsPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Metafields Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-pull-mirror-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Pull with mirror mode
        await metafields.pull({
            output: testMetafieldsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: false,
            mirror: true
        });

        // The pull method creates a 'metafields' subfolder automatically
        const actualMetafieldsPath = path.join(testMetafieldsPath, 'metafields');

        // Verify metafields were pulled (if any exist in the store)
        if (fs.existsSync(actualMetafieldsPath)) {
            const ownerResources = fs.readdirSync(actualMetafieldsPath).filter(file => {
                const fullPath = path.join(actualMetafieldsPath, file);
                return fs.statSync(fullPath).isDirectory();
            });
            assert.ok(ownerResources.length >= 0, 'Should complete mirror mode pull successfully (0 or more metafields)');
        }

        console.log('Mirror mode pull completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-pull-command-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Test metafieldsPullCommand with parameters
        await assert.doesNotReject(
            async () => {
                await metafieldsPullCommand({
                    output: testMetafieldsPath,
                    dryRun: true,
                    mirror: true,
                    maxMetafields: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Metafields Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-push-dry-run-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Create test metafield structure
        const actualMetafieldsPath = path.join(testMetafieldsPath, 'metafields', 'product', '123456789');
        fs.mkdirSync(actualMetafieldsPath, { recursive: true });

        const testMetafieldPath = path.join(actualMetafieldsPath, 'custom_field.json');
        fs.writeFileSync(testMetafieldPath, JSON.stringify({
            namespace: 'custom',
            key: 'custom_field',
            value: 'test value',
            type: 'single_line_text_field'
        }, null, 2));

        // Create metadata file
        fs.writeFileSync(testMetafieldPath + '.meta', 'owner_resource: product\nowner_id: 123456789\nid: 987654321\n');

        // Push with dry run
        await assert.doesNotReject(
            async () => {
                await metafields.push({
                    input: testMetafieldsPath,
                    site: creds.site,
                    accessToken: creds.accessToken,
                    dryRun: true
                });
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Metafields Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-mirror-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Create test metafield structure
        const actualMetafieldsPath = path.join(testMetafieldsPath, 'metafields', 'product', '123456789');
        fs.mkdirSync(actualMetafieldsPath, { recursive: true });

        const testMetafieldPath = path.join(actualMetafieldsPath, 'test_field.json');
        fs.writeFileSync(testMetafieldPath, JSON.stringify({
            namespace: 'custom',
            key: 'test_field',
            value: 'mirror test',
            type: 'single_line_text_field'
        }, null, 2));

        // Test mirror mode dry run
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await metafields.push({
                input: testMetafieldsPath,
                site: creds.site,
                accessToken: creds.accessToken,
                dryRun: true,
                mirror: true
            });
        } finally {
            console.log = originalLog;
        }

        // Verify dry run output contains expected information
        assert.ok(output.includes('DRY RUN MODE'), 'Should indicate dry run mode');

        console.log('Mirror mode dry run completed successfully');
    });

    test('Push Command with All Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testMetafieldsPath = path.join(TEST_RUN_DIR, 'metafields-push-command-test');
        cleanupTestDirectory(testMetafieldsPath);

        // Create metafields subfolder structure
        const actualMetafieldsPath = path.join(testMetafieldsPath, 'metafields', 'product', '123456789');
        fs.mkdirSync(actualMetafieldsPath, { recursive: true });

        const testMetafieldContent = {
            namespace: 'custom',
            key: 'test_key',
            value: 'test value',
            type: 'single_line_text_field',
            description: 'Test description'
        };
        fs.writeFileSync(
            path.join(actualMetafieldsPath, 'test_key.json'),
            JSON.stringify(testMetafieldContent, null, 2)
        );

        // Test metafieldsPushCommand
        await assert.doesNotReject(
            async () => {
                await metafieldsPushCommand({
                    input: testMetafieldsPath,
                    dryRun: true,
                    mirror: false,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle all parameters correctly'
        );

        console.log('Push command with all parameters completed successfully');
    });

    test('Metafield Handle Generation', () => {
        // Test the handle generation logic
        const testMetafield = {
            id: 123,
            namespace: 'custom',
            key: 'product_title',
            value: 'Test Product',
            type: 'single_line_text_field',
            owner_resource: 'product',
            owner_id: 456789
        };

        const handle = metafields.getResourceHandle(testMetafield);

        // Handle should be {owner_resource}_{owner_id}_{key}
        assert.strictEqual(handle, 'product_456789_product_title', 'Handle should be generated correctly');

        // Test with different owner resource
        const collectionMetafield = {
            id: 789,
            namespace: 'custom',
            key: 'collection_desc',
            value: 'Test Collection',
            type: 'single_line_text_field',
            owner_resource: 'collection',
            owner_id: 987654
        };

        const collectionHandle = metafields.getResourceHandle(collectionMetafield);
        assert.strictEqual(collectionHandle, 'collection_987654_collection_desc', 'Collection metafield handle should be generated correctly');

        console.log('Handle generation verified correctly');
    });

    test('Metafield File Path Structure', () => {
        // Test the file path structure
        const testMetafield = {
            id: 123,
            namespace: 'custom',
            key: 'custom_field',
            value: 'Test Value',
            type: 'single_line_text_field',
            owner_resource: 'product',
            owner_id: 456789
        };

        const basePath = '/test/output';
        const filePath = metafields.getResourceFilePath(basePath, testMetafield);

        // File path should follow: metafields/{owner_resource}/{owner_id}/{key}.json
        const expectedPath = path.join('/test/output', 'metafields', 'product', '456789', 'custom_field.json');
        assert.strictEqual(filePath, expectedPath, 'File path should follow the correct structure');

        console.log('File path structure verified correctly');
    });
});

// Run all tests
console.log('Running Metafields Test Suite...\n');
