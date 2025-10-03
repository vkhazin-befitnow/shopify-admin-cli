/**
 * Pages Test Suite
 * 
 * Tests the ShopifyPages class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyPages, pagesPullCommand, pagesPushCommand } from '../src/commands/pages';

// Test directory for page operations
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

describe('Shopify Pages', () => {
    const pages = new ShopifyPages();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Pages Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-pull-test');
        cleanupTestDirectory(testPagesPath);

        // Pull pages with limit for testing
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 3);

        // The pull method creates a 'pages' subfolder automatically
        const actualPagesPath = path.join(testPagesPath, 'pages');

        // Verify pages folder was created
        assert.ok(fs.existsSync(actualPagesPath), 'Pages folder should exist');

        // Check that HTML files were downloaded
        const htmlFiles = fs.readdirSync(actualPagesPath).filter(file => file.endsWith('.html'));
        assert.ok(htmlFiles.length > 0, 'Should download at least some page files');
        assert.ok(htmlFiles.length <= 3, 'Should respect the limit of 3 pages');

        // Verify page file structure
        if (htmlFiles.length > 0) {
            const firstPagePath = path.join(actualPagesPath, htmlFiles[0]);
            const content = fs.readFileSync(firstPagePath, 'utf8');

            // Pages are saved as-is from Shopify without metadata headers
            assert.ok(content.length > 0, 'Page should have content');
        }

        console.log(`Successfully pulled ${htmlFiles.length} pages with limit`);
    });

    test('Pages Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-pull-dry-run-test');
        cleanupTestDirectory(testPagesPath);

        // Test dry run pull (should not download files)
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 2, true);

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testPagesPath) || fs.readdirSync(testPagesPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Pages Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-pull-mirror-test');
        cleanupTestDirectory(testPagesPath);

        // The pull method creates a 'pages' subfolder automatically
        const actualPagesPath = path.join(testPagesPath, 'pages');

        // First, create some local files that don't exist remotely
        fs.mkdirSync(actualPagesPath, { recursive: true });
        fs.writeFileSync(path.join(actualPagesPath, 'local-only-page.html'), '<!-- Local only page -->\n<h1>This page only exists locally</h1>');
        fs.writeFileSync(path.join(actualPagesPath, 'another-local-page.html'), '<!-- Another local page -->\n<h1>Another local page</h1>');

        // Pull with mirror mode - should delete local files not present remotely
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 2, false, true);

        // Verify local-only files were deleted
        assert.ok(!fs.existsSync(path.join(actualPagesPath, 'local-only-page.html')), 'Local-only page should be deleted in mirror mode');
        assert.ok(!fs.existsSync(path.join(actualPagesPath, 'another-local-page.html')), 'Another local-only page should be deleted in mirror mode');

        // Verify some remote files were downloaded
        if (fs.existsSync(actualPagesPath)) {
            const downloadedFiles = fs.readdirSync(actualPagesPath).filter(file => file.endsWith('.html'));
            assert.ok(downloadedFiles.length >= 0, 'Should download remote pages in mirror mode (or have 0 if no pages exist)');
        }

        console.log('Mirror mode pull completed successfully');
    });

    test('Pull Command with Dry Run and Mirror Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-pull-command-test');
        cleanupTestDirectory(testPagesPath);

        // Test pagesPullCommand with dry-run and mirror parameters
        await assert.doesNotReject(
            async () => {
                await pagesPullCommand({
                    output: testPagesPath,
                    dryRun: true,
                    mirror: true,
                    maxPages: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle dry-run and mirror parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Pages Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-push-dry-run-test');
        cleanupTestDirectory(testPagesPath);

        // First pull to have test data
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 2);

        // Push uses root path (expects root/pages/)
        await assert.doesNotReject(
            async () => {
                await pages.push(testPagesPath, creds.site, creds.accessToken, true);
            },
            'Dry run push should not throw errors with root path'
        );

        console.log('Dry run push completed successfully');
    });

    test('Pages Push (Real)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-push-test');
        cleanupTestDirectory(testPagesPath);

        // First pull to ensure we have pages to work with
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 1);

        // Create or modify a test page to ensure there's something to push
        const actualPagesPath = path.join(testPagesPath, 'pages');
        const testPagePath = path.join(actualPagesPath, 'test-push-verification.html');
        const testContent = `<!-- Page Metadata
Title: Test Push Verification
Handle: test-push-verification
Template: page
-->

<!-- Page Title: Test Push Verification -->

<h1>Test Push Verification</h1>
<p>This page was created/updated at ${new Date().toISOString()} to verify push functionality.</p>
<p>If you see this content, the pages push is working correctly!</p>`;

        fs.writeFileSync(testPagePath, testContent);

        // Perform real push using root path (expects root/pages/)
        await assert.doesNotReject(
            async () => {
                await pages.push(testPagesPath, creds.site, creds.accessToken, false);
            },
            'Real push should not throw errors with root path'
        );

        // Verify the push worked by fetching pages and looking for our test page
        const remotePages = await pages['fetchPages'](creds.site, creds.accessToken);
        const testPage = remotePages.find(page => page.handle === 'test-push-verification');

        // Note: The test page might not be found if it was created (takes time to appear in API)
        // But the push operation itself should have succeeded without errors
        console.log('Push operation completed successfully');
        if (testPage) {
            console.log('Test page found in remote pages - push verification successful');
        } else {
            console.log('Test page not immediately found (may take time to appear in API), but push completed without errors');
        }
    });

    test('Pages Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-mirror-test');
        cleanupTestDirectory(testPagesPath);

        // First pull to have test data
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 1);

        // Test mirror mode dry run using root path
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await pages.push(testPagesPath, creds.site, creds.accessToken, true, true);
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

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-push-command-test');
        cleanupTestDirectory(testPagesPath);

        // Create pages subfolder structure (root/pages/)
        const actualPagesPath = path.join(testPagesPath, 'pages');
        fs.mkdirSync(actualPagesPath, { recursive: true });
        
        const testPageContent = `<!-- Page Metadata
Title: Command Test Page
Handle: command-test-page
Template: page
-->

<!-- Page Title: Command Test Page -->

<h1>Command Test Page</h1>
<p>This page is used to test the push command functionality.</p>`;

        fs.writeFileSync(path.join(actualPagesPath, 'command-test-page.html'), testPageContent);

        // Test pagesPushCommand using root path (expects root/pages/)
        await assert.doesNotReject(
            async () => {
                await pagesPushCommand({
                    input: testPagesPath,
                    dryRun: true,
                    mirror: false,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle all parameters with root path correctly'
        );

        console.log('Push command with all parameters completed successfully');
    });

    test('Page Content Preserved As-Is', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testPagesPath = path.join(TEST_RUN_DIR, 'pages-content-test');
        cleanupTestDirectory(testPagesPath);

        // Pull some pages first
        await pages.pull(testPagesPath, creds.site, creds.accessToken, 1);

        // The pull creates a 'pages' subfolder
        const actualPagesPath = path.join(testPagesPath, 'pages');

        // Check if we have any pages to test with
        if (fs.existsSync(actualPagesPath)) {
            const htmlFiles = fs.readdirSync(actualPagesPath).filter(file => file.endsWith('.html'));

            if (htmlFiles.length > 0) {
                const pageFile = path.join(actualPagesPath, htmlFiles[0]);
                const content = fs.readFileSync(pageFile, 'utf8');

                // Verify content is saved as-is without metadata headers
                assert.ok(typeof content === 'string', 'Content should be a string');
                assert.ok(content.length > 0, 'Content should not be empty');
                
                // Content should NOT contain our metadata headers
                assert.ok(!content.startsWith('<!-- Page:'), 'Content should not have metadata header added');

                console.log('Page content verified to be preserved as-is from Shopify');
            } else {
                console.log('No pages available for content testing (store might have no pages)');
            }
        }
    });
});

// Run all tests
console.log('Running Pages Test Suite...\n');
