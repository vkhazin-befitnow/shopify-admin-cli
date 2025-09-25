/**
 * Authentication Test Suite
 * 
 * Tests the ShopifyAuth class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ShopifyAuth } from '../src/commands/auth';

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

describe('Shopify Authentication', () => {
    const auth = new ShopifyAuth();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(),
            'Missing required environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    });

    test('Environment Variable Validation', async () => {
        const result = await auth.validate();

        assert.ok(result.shop, 'Shop information should be returned');
        assert.ok(result.shop.name, 'Shop name should be present');
        assert.ok(result.shop.domain, 'Shop domain should be present');
    });

    test('Explicit Parameter Validation', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await auth.validate({
            site: creds.site,
            accessToken: creds.accessToken
        });

        assert.ok(result.shop, 'Shop information should be returned');
        assert.ok(result.shop.name, 'Shop name should be present');
    });

    test('Invalid Credentials Handling', async () => {
        await assert.rejects(
            async () => {
                await auth.validate({
                    site: 'fake-store.myshopify.com',
                    accessToken: 'shpat_fake_token_12345'
                });
            },
            {
                message: /Unauthorized|invalid token|GraphQL request failed: 404|Not Found/
            },
            'Should reject invalid credentials'
        );
    });

    test('Scope Retrieval', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await auth.validate({
            site: creds.site,
            accessToken: creds.accessToken
        });

        assert.ok(result.scopes, 'Scopes should always be returned');
        assert.ok(Array.isArray(result.scopes), 'Scopes should be an array');
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
                    await auth.validate();
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