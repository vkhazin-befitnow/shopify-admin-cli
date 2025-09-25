/**
 * Themes Test Suite
 * 
 * Tests the ShopifyThemes class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ShopifyThemes } from '../src/commands/themes';

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

describe('Shopify Themes', () => {
    const themes = new ShopifyThemes();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(),
            'Missing required environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    });

    test('Environment Variable Theme List', async () => {
        const result = await themes.list();

        assert.ok(result.themes, 'Themes array should be returned');
        assert.ok(Array.isArray(result.themes), 'Themes should be an array');
        assert.ok(result.themes.length >= 0, 'Should return zero or more themes');
    });

    test('Explicit Parameter Theme List', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await themes.list({
            site: creds.site,
            accessToken: creds.accessToken
        });

        assert.ok(result.themes, 'Themes array should be returned');
        assert.ok(Array.isArray(result.themes), 'Themes should be an array');
    });

    test('Theme Structure Validation', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await themes.list({
            site: creds.site,
            accessToken: creds.accessToken
        });

        if (result.themes.length > 0) {
            const theme = result.themes[0];

            assert.ok(typeof theme.id === 'number', 'Theme should have numeric ID');
            assert.ok(typeof theme.name === 'string', 'Theme should have string name');
            assert.ok(typeof theme.role === 'string', 'Theme should have string role');
            assert.ok(typeof theme.previewable === 'boolean', 'Theme should have boolean previewable');
            assert.ok(typeof theme.processing === 'boolean', 'Theme should have boolean processing');
            assert.ok(typeof theme.created_at === 'string', 'Theme should have string created_at');
            assert.ok(typeof theme.updated_at === 'string', 'Theme should have string updated_at');

            // Optional fields
            if (theme.theme_store_id !== undefined) {
                assert.ok(typeof theme.theme_store_id === 'number', 'Theme store ID should be numeric if present');
            }
        }
    });

    test('Invalid Credentials Handling', async () => {
        await assert.rejects(
            async () => {
                await themes.list({
                    site: 'fake-store.myshopify.com',
                    accessToken: 'shpat_fake_token_12345'
                });
            },
            {
                message: /Unauthorized|invalid token|API request failed: 404|Not Found/
            },
            'Should reject invalid credentials'
        );
    });

    test('Missing Permissions Handling', async () => {
        // Test with a token that might not have themes permissions
        // This test might pass if the token has proper permissions
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        // This should succeed with proper permissions, or fail with 403
        try {
            const result = await themes.list({
                site: creds.site,
                accessToken: creds.accessToken
            });

            // If it succeeds, verify the structure
            assert.ok(result.themes, 'Themes array should be returned');
            assert.ok(Array.isArray(result.themes), 'Themes should be an array');

        } catch (error: any) {
            // If it fails, it should be a permissions error
            if (error.message.includes('403') || error.message.includes('Forbidden')) {
                assert.ok(error.message.includes('read_themes'), 'Should mention missing read_themes scope');
            } else {
                throw error; // Re-throw if it's not a permissions error
            }
        }
    });

    test('Missing Credentials Error', async () => {
        // Temporarily clear environment variables
        const originalDomain = process.env.SHOPIFY_STORE_DOMAIN;
        const originalToken = process.env.SHOPIFY_ACCESS_TOKEN;

        delete process.env.SHOPIFY_STORE_DOMAIN;
        delete process.env.SHOPIFY_ACCESS_TOKEN;

        try {
            await assert.rejects(
                async () => {
                    await themes.list();
                },
                {
                    message: /Missing credentials/
                },
                'Should throw error when no credentials provided'
            );
        } finally {
            // Restore environment variables
            if (originalDomain) process.env.SHOPIFY_STORE_DOMAIN = originalDomain;
            if (originalToken) process.env.SHOPIFY_ACCESS_TOKEN = originalToken;
        }
    });
});