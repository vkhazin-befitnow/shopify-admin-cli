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
import { ShopifyThemes } from '../src/commands/themes';

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