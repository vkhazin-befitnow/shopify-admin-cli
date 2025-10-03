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

        const testOutputPath = path.join(TEST_RUN_DIR, 'pulled-theme');

        // Pull theme with limited assets for testing
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 3, false, false, false);

        // Verify theme folder was created at root/themes/[ThemeName]/
        const actualThemePath = path.join(testOutputPath, 'themes', creds.testThemeName);
        assert.ok(fs.existsSync(actualThemePath), 'Theme folder should exist at root/themes/[ThemeName]/');

        // Verify standard Shopify theme directories
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        expectedDirs.forEach(dir => {
            const dirPath = path.join(actualThemePath, dir);
            assert.ok(fs.existsSync(dirPath), `Should create ${dir} directory`);
        });

        // Check that some files were downloaded
        let totalFiles = 0;
        expectedDirs.forEach(dir => {
            const dirPath = path.join(actualThemePath, dir);
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
        await themes.pull(creds.testThemeName, testThemePath, creds.site, creds.accessToken, 3, true, false, false);

        // Verify no files were actually downloaded
        assert.ok(!fs.existsSync(testThemePath) || fs.readdirSync(testThemePath).length === 0, 'Dry run should not create files');
    });

    test('Theme Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'pull-mirror-test');
        const actualThemePath = path.join(testOutputPath, 'themes', creds.testThemeName);

        // First, create some local files that don't exist remotely
        fs.mkdirSync(path.join(actualThemePath, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(actualThemePath, 'assets', 'local-only-file.js'), 'console.log("local only");');
        fs.writeFileSync(path.join(actualThemePath, 'assets', 'another-local-file.css'), '/* local only */');

        // Pull with mirror mode - should delete local files not present remotely
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 3, false, true, false);

        // Verify local-only files were deleted
        assert.ok(!fs.existsSync(path.join(actualThemePath, 'assets', 'local-only-file.js')), 'Local-only file should be deleted in mirror mode');
        assert.ok(!fs.existsSync(path.join(actualThemePath, 'assets', 'another-local-file.css')), 'Another local-only file should be deleted in mirror mode');

        // Verify some remote files were downloaded
        const assetsDir = path.join(actualThemePath, 'assets');
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

    test('Theme Pull (Published Flag)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'pull-published-test');

        // Pull published theme with limited assets for testing
        await themes.pull(null, testOutputPath, creds.site, creds.accessToken, 3, false, false, true);

        // Verify theme folder structure: output/themes/[ThemeName]/
        const themesDir = path.join(testOutputPath, 'themes');
        assert.ok(fs.existsSync(themesDir), 'Should create themes directory');
        
        const publishedThemeFolders = fs.readdirSync(themesDir);
        assert.ok(publishedThemeFolders.length > 0, 'Should create theme subfolder');
        
        // The published theme name folder should be created automatically
        const themeFolder = path.join(themesDir, publishedThemeFolders[0]);
        assert.ok(fs.existsSync(themeFolder), 'Theme subfolder should exist');

        // Verify standard Shopify theme directories
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        expectedDirs.forEach(dir => {
            const dirPath = path.join(themeFolder, dir);
            assert.ok(fs.existsSync(dirPath), `Should create ${dir} directory`);
        });
    });

    test('Theme Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'push-test-theme');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 2, false, false, false);

        // Push using root path (expects root/themes/[ThemeName]/)
        await assert.doesNotReject(
            async () => {
                await themes.push(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, true, false, false);
            },
            'Dry run push should not throw errors with root path'
        );
    });

    test('Theme Push (Published Flag Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'push-published-test');

        // First pull published theme to have test data
        await themes.pull(null, testOutputPath, creds.site, creds.accessToken, 2, false, false, true);

        // Test dry run push to published theme using root path
        await assert.doesNotReject(
            async () => {
                await themes.push(null, testOutputPath, creds.site, creds.accessToken, true, false, true);
            },
            'Dry run push to published theme should not throw errors with root path'
        );
    });

    test('Theme Push (Real)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'command-test');

        // First pull to ensure we have theme files to push
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 2, false, false, false);

        // Create or modify a test file to ensure there's something to push
        const actualThemePath = path.join(testOutputPath, 'themes', creds.testThemeName);
        const testFilePath = path.join(actualThemePath, 'assets', 'test-push-verification.js');
        const testContent = `// Test file created at ${new Date().toISOString()}\nconsole.log('Push test verification');`;
        fs.writeFileSync(testFilePath, testContent);

        // Perform real push using root path
        await themes.push(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, false, false, false);

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

        const testOutputPath = path.join(TEST_RUN_DIR, 'mirror-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 2, false, false, false);

        // Test mirror mode dry run - should show deletions
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themes.push(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, true, true, false);

            // In mirror mode, should mention mirror mode
            assert.ok(output.includes('Mirror Mode'), 'Should indicate mirror mode is active');

        } finally {
            console.log = originalLog;
        }
    });

    test('Theme Push Non-Mirror Mode (Consistency)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'non-mirror-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 1, false, false, false);

        // Test non-mirror mode dry run - should NOT show deletions
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themes.push(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, true, false, false);

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

        const testOutputPath = path.join(TEST_RUN_DIR, 'command-test');

        // First pull to have test data
        await themes.pull(creds.testThemeName, testOutputPath, creds.site, creds.accessToken, 1, false, false, false);

        // Test themesPushCommand with mirror parameter using root path (dry-run)
        await assert.doesNotReject(
            async () => {
                await themesPushCommand({
                    themeName: creds.testThemeName,
                    input: testOutputPath,
                    dryRun: true,
                    mirror: true,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle mirror parameter with root path correctly'
        );
    });

    test('Pull Command with Published Flag', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testThemePath = path.join(TEST_RUN_DIR, 'pull-command-published-test');

        // Test themesPullCommand with published flag
        await assert.doesNotReject(
            async () => {
                await themesPullCommand({
                    output: testThemePath,
                    dryRun: true,
                    published: true,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle published flag correctly'
        );
    });

    test('Push Command with Published Flag', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testOutputPath = path.join(TEST_RUN_DIR, 'push-command-published-test');

        // First pull published theme to have test data
        await themes.pull(null, testOutputPath, creds.site, creds.accessToken, 1, false, false, true);

        // Test themesPushCommand with published flag using root path
        await assert.doesNotReject(
            async () => {
                await themesPushCommand({
                    input: testOutputPath,
                    dryRun: true,
                    published: true,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle published flag with root path correctly'
        );
    });

    test('Invalid Theme Name', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testDir = path.join(TEST_RUN_DIR, 'invalid-theme');

        await assert.rejects(
            async () => {
                await themes.pull('NonExistentTheme', testDir, creds.site, creds.accessToken, undefined, false, false, false);
            },
            {
                message: /Theme "NonExistentTheme" not found/
            },
            'Should reject non-existent theme name'
        );
    });
});
