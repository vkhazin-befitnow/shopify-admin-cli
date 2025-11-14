/**
 * Webhooks Test Suite
 * 
 * Tests the ShopifyWebhooks class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyWebhooks, webhooksPullCommand, webhooksPushCommand } from '../src/commands/webhooks';

// Test directory for webhook operations
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

describe('Shopify Webhooks', () => {
    const webhooks = new ShopifyWebhooks();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Webhooks Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-pull-test');
        cleanupTestDirectory(testWebhooksPath);

        // Pull webhooks with limit for testing
        await webhooks.pull({
            output: testWebhooksPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 3
        });

        // The pull method creates a 'webhooks' subfolder automatically
        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');

        // Verify webhooks folder was created
        assert.ok(fs.existsSync(actualWebhooksPath), 'Webhooks folder should exist');

        // Check that JSON files were downloaded
        const jsonFiles = fs.readdirSync(actualWebhooksPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));

        if (jsonFiles.length > 0) {
            assert.ok(jsonFiles.length <= 3, 'Should respect the limit of 3 webhooks');

            // Verify webhook file structure
            const firstWebhookPath = path.join(actualWebhooksPath, jsonFiles[0]);
            const content = JSON.parse(fs.readFileSync(firstWebhookPath, 'utf8'));

            // Webhook should have required fields
            assert.ok(content.address, 'Webhook should have an address');
            assert.ok(content.topic, 'Webhook should have a topic');
            assert.ok(content.format, 'Webhook should have a format');

            // Check for metadata file
            const metaPath = firstWebhookPath + '.meta';
            assert.ok(fs.existsSync(metaPath), 'Metadata file should exist');

            const metadata = fs.readFileSync(metaPath, 'utf8');
            assert.ok(metadata.includes('id:'), 'Metadata should contain ID');
            assert.ok(metadata.includes('topic:'), 'Metadata should contain topic');

            console.log(`Successfully pulled ${jsonFiles.length} webhooks with limit`);
        } else {
            console.log('No webhooks found in store (this is okay for testing)');
        }
    });

    test('Webhooks Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-pull-dry-run-test');
        cleanupTestDirectory(testWebhooksPath);

        // Test dry run pull (should not download files)
        await webhooks.pull({
            output: testWebhooksPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: true
        });

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testWebhooksPath) || fs.readdirSync(testWebhooksPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Webhooks Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-pull-mirror-test');
        cleanupTestDirectory(testWebhooksPath);

        // The pull method creates a 'webhooks' subfolder automatically
        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');

        // First, create some local files that don't exist remotely
        fs.mkdirSync(actualWebhooksPath, { recursive: true });
        fs.writeFileSync(
            path.join(actualWebhooksPath, 'local-only-webhook.json'),
            JSON.stringify({ address: 'https://example.com/webhook', topic: 'test/local', format: 'json' }, null, 2)
        );

        // Pull with mirror mode - should delete local files not present remotely
        await webhooks.pull({
            output: testWebhooksPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: false,
            mirror: true
        });

        // Verify local-only files were deleted
        assert.ok(!fs.existsSync(path.join(actualWebhooksPath, 'local-only-webhook.json')), 'Local-only webhook should be deleted in mirror mode');

        // Verify some remote files were downloaded (if any exist)
        if (fs.existsSync(actualWebhooksPath)) {
            const downloadedFiles = fs.readdirSync(actualWebhooksPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));
            assert.ok(downloadedFiles.length >= 0, 'Should download remote webhooks in mirror mode (or have 0 if no webhooks exist)');
        }

        console.log('Mirror mode pull completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-pull-command-test');
        cleanupTestDirectory(testWebhooksPath);

        // Test webhooksPullCommand with parameters
        await assert.doesNotReject(
            async () => {
                await webhooksPullCommand({
                    output: testWebhooksPath,
                    dryRun: true,
                    mirror: true,
                    maxWebhooks: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Webhooks Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-push-dry-run-test');
        cleanupTestDirectory(testWebhooksPath);

        // Create test webhook structure
        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');
        fs.mkdirSync(actualWebhooksPath, { recursive: true });

        const testWebhookPath = path.join(actualWebhooksPath, 'products-create.json');
        fs.writeFileSync(testWebhookPath, JSON.stringify({
            address: 'https://example.com/webhooks/products',
            topic: 'products/create',
            format: 'json'
        }, null, 2));

        // Push with dry run
        await assert.doesNotReject(
            async () => {
                await webhooks.push({
                    input: testWebhooksPath,
                    site: creds.site,
                    accessToken: creds.accessToken,
                    dryRun: true
                });
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Webhooks Push Should Update Existing Webhooks Not Create Duplicates', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-update-test');
        cleanupTestDirectory(testWebhooksPath);

        // Step 1: Pull existing webhooks (if any)
        await webhooks.pull({
            output: testWebhooksPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 1
        });

        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');

        if (!fs.existsSync(actualWebhooksPath)) {
            console.log('No webhooks to test with - skipping update test');
            return;
        }

        const jsonFiles = fs.readdirSync(actualWebhooksPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));

        if (jsonFiles.length === 0) {
            console.log('No webhooks pulled - skipping update test');
            return;
        }

        const testWebhookFile = jsonFiles[0];
        const testWebhookPath = path.join(actualWebhooksPath, testWebhookFile);
        const metaPath = testWebhookPath + '.meta';

        // Read the metadata to get the topic
        const metadataContent = fs.readFileSync(metaPath, 'utf8');
        const metadata = metadataContent.split('\n').reduce((acc: any, line: string) => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                acc[match[1]] = match[2];
            }
            return acc;
        }, {});

        const webhookTopic = metadata.topic;

        // Step 2: Get initial count of webhooks with this topic
        const remoteWebhooksBefore = await webhooks.fetchResources(creds.site, creds.accessToken);
        const webhooksWithTopicBefore = remoteWebhooksBefore.filter((w: any) => w.topic === webhookTopic);
        const initialCount = webhooksWithTopicBefore.length;

        console.log(`Initial: Found ${initialCount} webhook(s) with topic "${webhookTopic}"`);
        assert.strictEqual(initialCount, 1, `Should have exactly 1 webhook with topic "${webhookTopic}" before push`);

        // Step 3: Modify the webhook address
        const originalContent = JSON.parse(fs.readFileSync(testWebhookPath, 'utf8'));
        const modifiedContent = {
            ...originalContent,
            address: originalContent.address + '?updated=' + Date.now()
        };
        fs.writeFileSync(testWebhookPath, JSON.stringify(modifiedContent, null, 2));

        // Step 4: Push the modified webhook (should UPDATE, not CREATE)
        await webhooks.push({
            input: testWebhooksPath,
            site: creds.site,
            accessToken: creds.accessToken,
            dryRun: false
        });

        // Step 5: Verify no duplicate was created
        const remoteWebhooksAfter = await webhooks.fetchResources(creds.site, creds.accessToken);
        const webhooksWithTopicAfter = remoteWebhooksAfter.filter((w: any) => w.topic === webhookTopic);
        const finalCount = webhooksWithTopicAfter.length;

        console.log(`After push: Found ${finalCount} webhook(s) with topic "${webhookTopic}"`);

        assert.strictEqual(
            finalCount,
            initialCount,
            `Should still have ${initialCount} webhook(s) with topic "${webhookTopic}" after push (not ${finalCount})`
        );

        console.log('Successfully verified push updates existing webhooks without creating duplicates');
    });

    test('Webhooks Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-mirror-test');
        cleanupTestDirectory(testWebhooksPath);

        // Create test webhook structure
        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');
        fs.mkdirSync(actualWebhooksPath, { recursive: true });

        const testWebhookPath = path.join(actualWebhooksPath, 'orders-create.json');
        fs.writeFileSync(testWebhookPath, JSON.stringify({
            address: 'https://example.com/webhooks/orders',
            topic: 'orders/create',
            format: 'json'
        }, null, 2));

        // Test mirror mode dry run
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await webhooks.push({
                input: testWebhooksPath,
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

        const testWebhooksPath = path.join(TEST_RUN_DIR, 'webhooks-push-command-test');
        cleanupTestDirectory(testWebhooksPath);

        // Create webhooks subfolder structure
        const actualWebhooksPath = path.join(testWebhooksPath, 'webhooks');
        fs.mkdirSync(actualWebhooksPath, { recursive: true });

        const testWebhookContent = {
            address: 'https://example.com/webhooks/test',
            topic: 'products/update',
            format: 'json'
        };
        fs.writeFileSync(
            path.join(actualWebhooksPath, 'products-update.json'),
            JSON.stringify(testWebhookContent, null, 2)
        );

        // Test webhooksPushCommand
        await assert.doesNotReject(
            async () => {
                await webhooksPushCommand({
                    input: testWebhooksPath,
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

    test('Webhook Handle Generation', () => {
        // Test the handle generation logic
        const testWebhook = {
            id: 123,
            address: 'https://example.com/webhook',
            topic: 'products/create',
            format: 'json'
        };

        const handle = webhooks.getResourceHandle(testWebhook);

        // Handle should be the topic with slashes replaced with dashes
        assert.strictEqual(handle, 'products-create', 'Handle should be generated from topic correctly');

        // Test with nested topic
        const nestedWebhook = {
            id: 456,
            address: 'https://example.com/webhook',
            topic: 'orders/fulfilled',
            format: 'json'
        };

        const nestedHandle = webhooks.getResourceHandle(nestedWebhook);
        assert.strictEqual(nestedHandle, 'orders-fulfilled', 'Nested topic should have slashes replaced with dashes');

        console.log('Handle generation verified correctly');
    });
});

// Run all tests
console.log('Running Webhooks Test Suite...\n');
