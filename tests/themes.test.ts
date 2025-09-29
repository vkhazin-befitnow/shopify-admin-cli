/**
 * Themes Test Suite
 * 
 * Tests the ShopifyThemes class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, and SHOPIFY_TEST_THEME_NAME
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyThemes, themesPullCommand, themesPushCommand } from '../src/commands/themes';

// Test directory for theme operations
const TEST_RUN_DIR = path.join(__dirname, 'test-run');

// Helper functions
function hasCredentials(): boolean {
    return !!(
        process.env.SHOPIFY_STORE_DOMAIN &&
        process.env.SHOPIFY_ACCESS_TOKEN &&
        process.env.SHOPIFY_TEST_THEME_NAME
    );
}

function getCredentials(): { site: string; accessToken: string; testThemeName: string } | null {
    if (hasCredentials()) {
        return {
            site: process.env.SHOPIFY_STORE_DOMAIN!,
            accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
            testThemeName: process.env.SHOPIFY_TEST_THEME_NAME!
        };
    }
    return null;
}

describe('Shopify Themes', () => {
    const themes = new ShopifyThemes();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN, and SHOPIFY_TEST_THEME_NAME should be set');
    });

    test('Theme Pull', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'pulled-theme');

        // Pull theme with limited assets for testing
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 3);

        // Verify theme folder was created with proper structure
        assert.ok(fs.existsSync(testThemePath), 'Theme folder should exist');

        // Verify standard Shopify theme directories
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        expectedDirs.forEach(dir => {
            const dirPath = path.join(testThemePath, dir);
            assert.ok(fs.existsSync(dirPath), `Should create ${dir} directory`);
        });

        // Check that some files were downloaded
        let totalFiles = 0;
        expectedDirs.forEach(dir => {
            const dirPath = path.join(testThemePath, dir);
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath, { recursive: true });
                totalFiles += files.length;
            }
        });

        assert.ok(totalFiles > 0, 'Should download at least some theme files');
    });

    test('Theme Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'pull-dry-run-test');

        // Test dry run pull (should not download files)
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 3, true);

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testThemePath) || fs.readdirSync(testThemePath).length === 0, 'Dry run should not create files');
    });

    test('Theme Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'pull-mirror-test');

        // First, create some local files that don't exist remotely
        fs.mkdirSync(path.join(testThemePath, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(testThemePath, 'assets', 'local-only-file.js'), 'console.log("local only");');
        fs.writeFileSync(path.join(testThemePath, 'assets', 'another-local-file.css'), '/* local only */');

        // Pull with mirror mode - should delete local files not present remotely
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 3, false, true);

        // Verify local-only files were deleted
        assert.ok(!fs.existsSync(path.join(testThemePath, 'assets', 'local-only-file.js')), 'Local-only file should be deleted in mirror mode');
        assert.ok(!fs.existsSync(path.join(testThemePath, 'assets', 'another-local-file.css')), 'Another local-only file should be deleted in mirror mode');

        // Verify some remote files were downloaded
        const assetsDir = path.join(testThemePath, 'assets');
        if (fs.existsSync(assetsDir)) {
            const downloadedFiles = fs.readdirSync(assetsDir);
            assert.ok(downloadedFiles.length > 0, 'Should download remote files in mirror mode');
        }
    });

    test('Pull Command with Dry Run and Mirror Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'pull-command-test');

        // Test themesPullCommand with dry-run and mirror parameters
        await assert.doesNotReject(
            async () => {
                await themesPullCommand({
                    themeName: creds.testThemeName,
                    output: testThemePath,
                    dryRun: true,
                    mirror: true,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle dry-run and mirror parameters correctly'
        );
    });

    test('Theme Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'push-test-theme');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 2);

        // Test dry run (should not throw errors and should complete)
        await assert.doesNotReject(
            async () => {
                await themes.push(creds.testThemeName, testThemePath, creds.site, creds.accessToken, true);
            },
            'Dry run push should not throw errors'
        );
    });

    test('Theme Push (Real)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'command-test');

        // First pull to ensure we have theme files to push
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 2);

        // Create or modify a test file to ensure there's something to push
        const testFilePath = path.join(testThemePath, 'assets', 'test-push-verification.js');
        const testContent = `// Test file created at ${new Date().toISOString()}\nconsole.log('Push test verification');`;
        fs.writeFileSync(testFilePath, testContent);

        // Perform real push (this should throw if it fails)
        await themes.push(creds.testThemeName, testThemePath, creds.site, creds.accessToken, false);

        // Verify the push worked by checking if our test file exists remotely
        // Use the themes instance to fetch assets and look for our specific file
        const themesList = await themes['fetchThemes'](creds.site, creds.accessToken);
        const theme = themesList.themes.find(t => t.name.toLowerCase() === creds.testThemeName.toLowerCase());
        assert.ok(theme, 'Theme should exist');

        const remoteAssets = await themes['fetchThemeAssets'](creds.site, creds.accessToken, theme.id);
        const testAsset = remoteAssets.find(asset => asset.key === 'assets/test-push-verification.js');

        assert.ok(testAsset, 'Test file should exist in remote theme after push');
        console.log('Push verification successful: test file found in remote theme');
    });

    test('Theme Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'mirror-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 2);

        // Test mirror mode dry run - should show deletions
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themes.push(creds.testThemeName, testThemePath, creds.site, creds.accessToken, true, true);

            // In mirror mode, should mention mirror mode
            assert.ok(output.includes('Mirror Mode'), 'Should indicate mirror mode is active');

        } finally {
            console.log = originalLog;
        }
    });

    test('Theme Push Non-Mirror Mode (Consistency)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'non-mirror-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 1);

        // Test non-mirror mode dry run - should NOT show deletions
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themes.push(creds.testThemeName, testThemePath, creds.site, creds.accessToken, true, false);

            // In non-mirror mode, should NOT mention files to delete
            assert.ok(!output.includes('will be deleted'), 'Should not show deletions in non-mirror mode');
            assert.ok(!output.includes('Mirror Mode'), 'Should not indicate mirror mode');

        } finally {
            console.log = originalLog;
        }
    });

    test('Push Command with Mirror Parameter', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'command-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 1);

        // Test themesPushCommand with mirror parameter (dry-run)
        await assert.doesNotReject(
            async () => {
                await themesPushCommand({
                    themeName: creds.testThemeName,
                    input: testThemePath,
                    dryRun: true,
                    mirror: true,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle mirror parameter correctly'
        );
    });

    test('Invalid Theme Name', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testDir = path.join(TEST_RUN_DIR, 'invalid-theme');

        await assert.rejects(
            async () => {
                await themes.pull('NonExistentTheme', testDir, creds.site, creds.accessToken);
            },
            {
                message: /Theme "NonExistentTheme" not found/
            },
            'Should reject non-existent theme name'
        );
    });
});