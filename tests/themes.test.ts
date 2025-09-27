/**
 * Themes Test Suite
 * 
 * Tests the ShopifyThemes class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyThemes, themesListCommand, themesPullCommand, themesPushCommand } from '../src/commands/themes';

// Test directory for theme pull operations
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

// Helper to get a theme name for pull tests
async function getTestThemeName(): Promise<string | null> {
    const themes = new ShopifyThemes();
    const creds = getCredentials();

    if (!creds) return null;

    try {
        const result = await themes.list({
            site: creds.site,
            accessToken: creds.accessToken
        });

        return result.themes.length > 0 ? result.themes[0].name : null;
    } catch {
        return null;
    }
}

describe('Shopify Themes', () => {
    const themes = new ShopifyThemes();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Theme List', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await themes.list({
            site: creds.site,
            accessToken: creds.accessToken
        });

        assert.ok(Array.isArray(result.themes), 'Should return themes array');
        assert.ok(result.themes.length > 0, 'Should have at least one theme');

        // Verify theme structure
        const theme = result.themes[0];
        assert.ok(typeof theme.id === 'number', 'Theme should have numeric ID');
        assert.ok(typeof theme.name === 'string', 'Theme should have name');
        assert.ok(typeof theme.role === 'string', 'Theme should have role');
    });

    test('Theme Pull', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const themeName = await getTestThemeName();
        assert.ok(themeName, 'Should have at least one theme available for testing');

        const testDir = path.join(TEST_RUN_DIR, 'theme-pull');

        await themes.pull(themeName, testDir, creds.site, creds.accessToken, 3);

        // Verify themes folder was created
        const themesDir = path.join(testDir, 'themes');
        assert.ok(fs.existsSync(themesDir), 'Should create themes directory');

        // Verify theme-specific folder exists
        const contents = fs.readdirSync(themesDir);
        assert.ok(contents.length > 0, 'Should create theme-specific folder');

        const themeFolder = path.join(themesDir, contents[0]);
        assert.ok(fs.existsSync(themeFolder), 'Theme folder should exist');

        // Verify standard Shopify theme directories
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        expectedDirs.forEach(dir => {
            const dirPath = path.join(themeFolder, dir);
            assert.ok(fs.existsSync(dirPath), `Should create ${dir} directory`);
        });

        // Check that some files were downloaded
        let totalFiles = 0;
        expectedDirs.forEach(dir => {
            const dirPath = path.join(themeFolder, dir);
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath, { recursive: true });
                totalFiles += files.length;
            }
        });

        assert.ok(totalFiles > 0, 'Should download at least some theme files');
    });

    test('Theme Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const themeName = await getTestThemeName();
        assert.ok(themeName, 'Should have at least one theme available for testing');

        // First pull a theme to have test data
        const pullDir = path.join(TEST_RUN_DIR, 'theme-push-test');
        await themes.pull(themeName, pullDir, creds.site, creds.accessToken, 1);

        // The pulled theme is in pullDir/themes/ThemeName, but push expects the parent directory
        // So we pass the pullDir as input path, and it will find themes/ThemeName inside it

        // Test dry run (should not throw errors and should complete)
        await assert.doesNotReject(
            async () => {
                await themes.push(themeName, pullDir, creds.site, creds.accessToken, true);
            },
            'Dry run push should not throw errors'
        );
    });

    test('Theme Push Mirror Mode (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const themeName = await getTestThemeName();
        assert.ok(themeName, 'Should have at least one theme available for testing');

        // First pull a theme to have test data
        const pullDir = path.join(TEST_RUN_DIR, 'theme-mirror-test');
        await themes.pull(themeName, pullDir, creds.site, creds.accessToken, 2);

        // Test mirror mode dry run - should show deletions
        let output = '';
        let errorOutput = '';
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (msg: any) => { output += msg + '\n'; };
        console.error = (msg: any) => { errorOutput += msg + '\n'; };

        try {
            await themes.push(themeName, pullDir, creds.site, creds.accessToken, true, true);

            // In mirror mode, should mention files to delete if there are any
            assert.ok(output.includes('Mirror Mode'), 'Should indicate mirror mode is active');

        } finally {
            console.log = originalLog;
            console.error = originalError;
        }
    });

    test('Theme Push Non-Mirror Mode (Consistency)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const themeName = await getTestThemeName();
        assert.ok(themeName, 'Should have at least one theme available for testing');

        // First pull a theme to have test data
        const pullDir = path.join(TEST_RUN_DIR, 'theme-non-mirror-test');
        await themes.pull(themeName, pullDir, creds.site, creds.accessToken, 1);

        // Test non-mirror mode dry run - should NOT show deletions
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themes.push(themeName, pullDir, creds.site, creds.accessToken, true, false);

            // In non-mirror mode, should NOT mention files to delete
            assert.ok(!output.includes('will be deleted'), 'Should not show deletions in non-mirror mode');
            assert.ok(!output.includes('Mirror Mode'), 'Should not indicate mirror mode');

        } finally {
            console.log = originalLog;
        }
    });

    test('Theme Push Command Functions', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        // Test list command function
        let output = '';
        const originalLog = console.log;
        console.log = (msg: any) => { output += msg + '\n'; };

        try {
            await themesListCommand({
                site: creds.site,
                accessToken: creds.accessToken
            });

            assert.ok(output.includes('themes:'), 'List command should output YAML with themes');
        } finally {
            console.log = originalLog;
        }
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