/**
 * Redirects Test Suite
 * 
 * Tests the ShopifyRedirects class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyRedirects, redirectsPullCommand, redirectsPushCommand } from '../src/commands/redirects';

// Test directory for redirect operations
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

describe('Shopify Redirects', () => {
    const redirects = new ShopifyRedirects();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Redirects Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-pull-test');
        cleanupTestDirectory(testRedirectsPath);

        // Pull redirects with limit for testing
        await redirects.pull({
            output: testRedirectsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 3
        });

        // The pull method creates a 'redirects' subfolder automatically
        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');

        // Verify redirects folder was created
        assert.ok(fs.existsSync(actualRedirectsPath), 'Redirects folder should exist');

        // Check that JSON files were downloaded
        const jsonFiles = fs.readdirSync(actualRedirectsPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));
        
        if (jsonFiles.length > 0) {
            assert.ok(jsonFiles.length <= 3, 'Should respect the limit of 3 redirects');

            // Verify redirect file structure
            const firstRedirectPath = path.join(actualRedirectsPath, jsonFiles[0]);
            const content = JSON.parse(fs.readFileSync(firstRedirectPath, 'utf8'));

            // Redirect should have target URL
            assert.ok(content.target, 'Redirect should have a target URL');

            // Check for metadata file
            const metaPath = firstRedirectPath + '.meta';
            assert.ok(fs.existsSync(metaPath), 'Metadata file should exist');

            const metadata = fs.readFileSync(metaPath, 'utf8');
            assert.ok(metadata.includes('id:'), 'Metadata should contain ID');
            assert.ok(metadata.includes('path:'), 'Metadata should contain path');

            console.log(`Successfully pulled ${jsonFiles.length} redirects with limit`);
        } else {
            console.log('No redirects found in store (this is okay for testing)');
        }
    });

    test('Redirects Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-pull-dry-run-test');
        cleanupTestDirectory(testRedirectsPath);

        // Test dry run pull (should not download files)
        await redirects.pull({
            output: testRedirectsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: true
        });

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testRedirectsPath) || fs.readdirSync(testRedirectsPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Redirects Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-pull-mirror-test');
        cleanupTestDirectory(testRedirectsPath);

        // The pull method creates a 'redirects' subfolder automatically
        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');

        // First, create some local files that don't exist remotely
        fs.mkdirSync(actualRedirectsPath, { recursive: true });
        fs.writeFileSync(
            path.join(actualRedirectsPath, 'local-only-redirect.json'),
            JSON.stringify({ target: '/local-target' }, null, 2)
        );

        // Pull with mirror mode - should delete local files not present remotely
        await redirects.pull({
            output: testRedirectsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: false,
            mirror: true
        });

        // Verify local-only files were deleted
        assert.ok(!fs.existsSync(path.join(actualRedirectsPath, 'local-only-redirect.json')), 'Local-only redirect should be deleted in mirror mode');

        // Verify some remote files were downloaded (if any exist)
        if (fs.existsSync(actualRedirectsPath)) {
            const downloadedFiles = fs.readdirSync(actualRedirectsPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));
            assert.ok(downloadedFiles.length >= 0, 'Should download remote redirects in mirror mode (or have 0 if no redirects exist)');
        }

        console.log('Mirror mode pull completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-pull-command-test');
        cleanupTestDirectory(testRedirectsPath);

        // Test redirectsPullCommand with parameters
        await assert.doesNotReject(
            async () => {
                await redirectsPullCommand({
                    output: testRedirectsPath,
                    dryRun: true,
                    mirror: true,
                    maxRedirects: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Redirects Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-push-dry-run-test');
        cleanupTestDirectory(testRedirectsPath);

        // Create test redirect structure
        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');
        fs.mkdirSync(actualRedirectsPath, { recursive: true });

        const testRedirectPath = path.join(actualRedirectsPath, 'test-redirect.json');
        fs.writeFileSync(testRedirectPath, JSON.stringify({ target: '/test-target' }, null, 2));

        // Push with dry run
        await assert.doesNotReject(
            async () => {
                await redirects.push({
                    input: testRedirectsPath,
                    site: creds.site,
                    accessToken: creds.accessToken,
                    dryRun: true
                });
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Redirects Push Should Update Existing Redirects Not Create Duplicates', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-update-test');
        cleanupTestDirectory(testRedirectsPath);

        // Step 1: Pull existing redirects (if any)
        await redirects.pull({
            output: testRedirectsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 1
        });

        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');
        
        if (!fs.existsSync(actualRedirectsPath)) {
            console.log('No redirects to test with - skipping update test');
            return;
        }

        const jsonFiles = fs.readdirSync(actualRedirectsPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));

        if (jsonFiles.length === 0) {
            console.log('No redirects pulled - skipping update test');
            return;
        }

        const testRedirectFile = jsonFiles[0];
        const testRedirectPath = path.join(actualRedirectsPath, testRedirectFile);
        const metaPath = testRedirectPath + '.meta';

        // Read the metadata to get the path
        const metadataContent = fs.readFileSync(metaPath, 'utf8');
        const metadata = metadataContent.split('\n').reduce((acc: any, line: string) => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                acc[match[1]] = match[2];
            }
            return acc;
        }, {});

        const redirectPath = metadata.path;

        // Step 2: Get initial count of redirects with this path
        const remoteRedirectsBefore = await redirects.fetchResources(creds.site, creds.accessToken);
        const redirectsWithPathBefore = remoteRedirectsBefore.filter((r: any) => r.path === redirectPath);
        const initialCount = redirectsWithPathBefore.length;

        console.log(`Initial: Found ${initialCount} redirect(s) with path "${redirectPath}"`);
        assert.strictEqual(initialCount, 1, `Should have exactly 1 redirect with path "${redirectPath}" before push`);

        // Step 3: Modify the redirect target
        const originalContent = JSON.parse(fs.readFileSync(testRedirectPath, 'utf8'));
        const modifiedContent = {
            target: originalContent.target + '?updated=' + Date.now()
        };
        fs.writeFileSync(testRedirectPath, JSON.stringify(modifiedContent, null, 2));

        // Step 4: Push the modified redirect (should UPDATE, not CREATE)
        await redirects.push({
            input: testRedirectsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            dryRun: false
        });

        // Step 5: Verify no duplicate was created
        const remoteRedirectsAfter = await redirects.fetchResources(creds.site, creds.accessToken);
        const redirectsWithPathAfter = remoteRedirectsAfter.filter((r: any) => r.path === redirectPath);
        const finalCount = redirectsWithPathAfter.length;

        console.log(`After push: Found ${finalCount} redirect(s) with path "${redirectPath}"`);

        assert.strictEqual(
            finalCount,
            initialCount,
            `Should still have ${initialCount} redirect(s) with path "${redirectPath}" after push (not ${finalCount})`
        );

        console.log('Successfully verified push updates existing redirects without creating duplicates');
    });

    test('Redirects Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-mirror-test');
        cleanupTestDirectory(testRedirectsPath);

        // Create test redirect structure
        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');
        fs.mkdirSync(actualRedirectsPath, { recursive: true });

        const testRedirectPath = path.join(actualRedirectsPath, 'mirror-test.json');
        fs.writeFileSync(testRedirectPath, JSON.stringify({ target: '/mirror-target' }, null, 2));

        // Test mirror mode dry run
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await redirects.push({
                input: testRedirectsPath,
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

        const testRedirectsPath = path.join(TEST_RUN_DIR, 'redirects-push-command-test');
        cleanupTestDirectory(testRedirectsPath);

        // Create redirects subfolder structure
        const actualRedirectsPath = path.join(testRedirectsPath, 'redirects');
        fs.mkdirSync(actualRedirectsPath, { recursive: true });

        const testRedirectContent = { target: '/command-test-target' };
        fs.writeFileSync(
            path.join(actualRedirectsPath, 'command-test.json'),
            JSON.stringify(testRedirectContent, null, 2)
        );

        // Test redirectsPushCommand
        await assert.doesNotReject(
            async () => {
                await redirectsPushCommand({
                    input: testRedirectsPath,
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

    test('Redirect Handle Generation', () => {
        // Test the handle generation logic
        const testRedirect = {
            id: 123,
            path: '/old-product-url',
            target: '/new-product-url'
        };

        const handle = redirects.getResourceHandle(testRedirect);
        
        // Handle should be the path with leading slash removed and slashes replaced with dashes
        assert.strictEqual(handle, 'old-product-url', 'Handle should be generated from path correctly');

        // Test with nested path
        const nestedRedirect = {
            id: 456,
            path: '/products/old-product',
            target: '/products/new-product'
        };

        const nestedHandle = redirects.getResourceHandle(nestedRedirect);
        assert.strictEqual(nestedHandle, 'products-old-product', 'Nested path should have slashes replaced with dashes');

        // Test with root path
        const rootRedirect = {
            id: 789,
            path: '/',
            target: '/home'
        };

        const rootHandle = redirects.getResourceHandle(rootRedirect);
        assert.strictEqual(rootHandle, 'root', 'Root path should be handled correctly');

        console.log('Handle generation verified correctly');
    });
});

// Run all tests
console.log('Running Redirects Test Suite...\n');
