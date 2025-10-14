/**
 * GraphQL Client Test Suite
 * 
 * Tests the GraphQLClient utility with real API calls.
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { GraphQLClient } from '../src/utils/graphql-client';

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

describe('GraphQLClient', () => {
    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('should execute a simple query successfully', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const query = `
            query {
                shop {
                    name
                    email
                }
            }
        `;

        const data = await GraphQLClient.query(creds.site, creds.accessToken, query, undefined, 'shop');

        assert.ok(data.shop, 'Should return shop data');
        assert.ok(data.shop.name, 'Shop should have a name');
        console.log(`Successfully queried shop: ${data.shop.name}`);
    });

    test('should execute a query with variables', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const query = `
            query GetProducts($first: Int!) {
                products(first: $first) {
                    edges {
                        node {
                            id
                            title
                        }
                    }
                }
            }
        `;

        const variables = { first: 2 };

        const data = await GraphQLClient.query(
            creds.site,
            creds.accessToken,
            query,
            variables,
            'products'
        );

        assert.ok(data.products, 'Should return products data');
        assert.ok(Array.isArray(data.products.edges), 'Products should have edges array');
        console.log(`Successfully queried ${data.products.edges.length} products`);
    });

    test('should handle GraphQL errors gracefully', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        // Invalid query - missing closing brace
        const invalidQuery = `
            query {
                shop {
                    name
        `;

        await assert.rejects(
            async () => {
                await GraphQLClient.query(creds.site, creds.accessToken, invalidQuery, undefined, 'shop');
            },
            (error: Error) => {
                assert.ok(error.message.includes('GraphQL errors'), 'Error should mention GraphQL errors');
                return true;
            },
            'Should throw error for invalid query'
        );

        console.log('Successfully handled GraphQL syntax error');
    });

    test('should handle unauthorized access', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const query = `
            query {
                shop {
                    name
                }
            }
        `;

        await assert.rejects(
            async () => {
                await GraphQLClient.query(creds.site, 'invalid-token', query, undefined, 'shop');
            },
            (error: Error) => {
                assert.ok(error.message.includes('Unauthorized'), 'Error should mention unauthorized');
                return true;
            },
            'Should throw error for invalid token'
        );

        console.log('Successfully handled unauthorized access');
    });

    test('should use request method for full response', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const query = `
            query {
                shop {
                    name
                }
            }
        `;

        const response = await GraphQLClient.request(
            creds.site,
            creds.accessToken,
            query,
            undefined,
            'shop'
        );

        assert.ok(response.data, 'Response should have data property');
        assert.ok(response.data.shop, 'Data should contain shop');
        assert.strictEqual(response.errors, undefined, 'Should not have errors for valid query');
        console.log('Successfully retrieved full GraphQL response');
    });

    test('should execute mutation method', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        // Use a safe query disguised as mutation for testing
        // (we don't want to actually mutate data in tests)
        const query = `
            query {
                shop {
                    name
                }
            }
        `;

        const data = await GraphQLClient.mutation(
            creds.site,
            creds.accessToken,
            query,
            undefined,
            'shop'
        );

        assert.ok(data.shop, 'Mutation method should return data');
        console.log('Successfully executed mutation method');
    });
});

console.log('Running GraphQL Client Test Suite...\n');