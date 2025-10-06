/**
 * Authentication Test Suite
 * 
 * Tests authentication functionality including:
 * - ShopifyAuth class with real API calls (no mocks)
 * - getCredentialsFromEnv utility function
 * 
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { ShopifyAuth } from '../src/commands/auth';
import { getCredentialsFromEnv } from '../src/utils/auth';

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

describe('Authentication', () => {
    const auth = new ShopifyAuth();
    const originalEnv = { ...process.env };

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(),
            'Missing required environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    });

    test('ShopifyAuth: Environment Variable Validation', async () => {
        const result = await auth.validate();

        assert.ok(result.shop, 'Shop information should be returned');
        assert.ok(result.shop.name, 'Shop name should be present');
        assert.ok(result.shop.domain, 'Shop domain should be present');
    });

    test('ShopifyAuth: Explicit Parameter Validation', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await auth.validate(creds.site, creds.accessToken);

        assert.ok(result.shop, 'Shop information should be returned');
        assert.ok(result.shop.name, 'Shop name should be present');
    });

    test('ShopifyAuth: Invalid Credentials Handling', async () => {
        await assert.rejects(
            async () => {
                await auth.validate('fake-store.myshopify.com', 'shpat_fake_token_12345');
            },
            {
                message: /Unauthorized|invalid token|GraphQL request failed: 404|Not Found/
            },
            'Should reject invalid credentials'
        );
    });

    test('ShopifyAuth: Scope Retrieval', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const result = await auth.validate(creds.site, creds.accessToken);

        assert.ok(result.scopes, 'Scopes should always be returned');
        assert.ok(Array.isArray(result.scopes), 'Scopes should be an array');
    });

    test('ShopifyAuth: Missing Credentials Error', async () => {
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
            if (originalDomain) process.env.SHOPIFY_STORE_DOMAIN = originalDomain;
            if (originalToken) process.env.SHOPIFY_ACCESS_TOKEN = originalToken;
        }
    });

    test('getCredentialsFromEnv: should return credentials when both env vars are set', () => {
        process.env.SHOPIFY_STORE_DOMAIN = 'test-store.myshopify.com';
        process.env.SHOPIFY_ACCESS_TOKEN = 'test-token-123';

        const credentials = getCredentialsFromEnv();

        assert.deepStrictEqual(credentials, {
            site: 'test-store.myshopify.com',
            accessToken: 'test-token-123'
        });

        process.env = { ...originalEnv };
    });

    test('getCredentialsFromEnv: should return null when credentials are missing or invalid', () => {
        // Test missing site
        delete process.env.SHOPIFY_STORE_DOMAIN;
        process.env.SHOPIFY_ACCESS_TOKEN = 'test-token-123';
        assert.strictEqual(getCredentialsFromEnv(), null);

        // Test empty strings
        process.env.SHOPIFY_STORE_DOMAIN = '';
        process.env.SHOPIFY_ACCESS_TOKEN = '';
        assert.strictEqual(getCredentialsFromEnv(), null);

        process.env = { ...originalEnv };
    });
});
