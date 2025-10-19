/**
 * Collections Test Suite
 * 
 * Tests the ShopifyCollections class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyCollections, collectionsPullCommand, collectionsPushCommand } from '../src/commands/collections';

const TEST_RUN_DIR = path.join(__dirname, 'test-run');

function hasCredentials(): boolean {
    return !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN);
}

function getCredentials(): { site: string; accessToken: string } | null {
    if (!hasCredentials()) {
        return null;
    }
    return {
        site: process.env.SHOPIFY_STORE_DOMAIN!,
        accessToken: process.env.SHOPIFY_ACCESS_TOKEN!
    };
}

function cleanupTestDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

describe('Shopify Collections', () => {
    const collections = new ShopifyCollections();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Collections Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-pull-test');
        cleanupTestDirectory(testCollectionsPath);

        await collections.pull({
            output: testCollectionsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 3
        });

        const actualCollectionsPath = path.join(testCollectionsPath, 'collections');

        assert.ok(fs.existsSync(actualCollectionsPath), 'Collections folder should exist');

        const jsonFiles = fs.readdirSync(actualCollectionsPath).filter(file => file.endsWith('.json') && !file.endsWith('.meta'));
        assert.ok(jsonFiles.length > 0, 'Should download at least some collection files');
        assert.ok(jsonFiles.length <= 3, 'Should respect the limit of 3 collections');

        if (jsonFiles.length > 0) {
            const firstCollectionPath = path.join(actualCollectionsPath, jsonFiles[0]);
            const content = fs.readFileSync(firstCollectionPath, 'utf8');
            const collectionData = JSON.parse(content);

            assert.ok(collectionData.title, 'Collection should have title');
            assert.ok(collectionData.sort_order, 'Collection should have sort_order');
        }

        console.log(`Successfully pulled ${jsonFiles.length} collections with limit`);
    });

    test('Collections Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-pull-dry-run-test');
        cleanupTestDirectory(testCollectionsPath);

        await collections.pull({
            output: testCollectionsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: true
        });

        assert.ok(!fs.existsSync(testCollectionsPath) || fs.readdirSync(testCollectionsPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Collections Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-pull-mirror-test');
        cleanupTestDirectory(testCollectionsPath);

        const actualCollectionsPath = path.join(testCollectionsPath, 'collections');

        fs.mkdirSync(actualCollectionsPath, { recursive: true });
        fs.writeFileSync(path.join(actualCollectionsPath, 'local-only-collection.json'), JSON.stringify({ title: 'Local Only' }, null, 2));

        await collections.pull({
            output: testCollectionsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2,
            dryRun: false,
            mirror: true
        });

        assert.ok(!fs.existsSync(path.join(actualCollectionsPath, 'local-only-collection.json')), 'Local-only collection should be deleted in mirror mode');

        console.log('Mirror mode pull completed successfully');
    });

    test('Collections Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-push-dry-run-test');
        cleanupTestDirectory(testCollectionsPath);

        await collections.pull({
            output: testCollectionsPath,
            site: creds.site,
            accessToken: creds.accessToken,
            maxItems: 2
        });

        await assert.doesNotReject(
            async () => {
                await collections.push({
                    input: testCollectionsPath,
                    site: creds.site,
                    accessToken: creds.accessToken,
                    dryRun: true
                });
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-pull-command-test');
        cleanupTestDirectory(testCollectionsPath);

        await assert.doesNotReject(
            async () => {
                await collectionsPullCommand({
                    output: testCollectionsPath,
                    dryRun: true,
                    mirror: true,
                    maxCollections: 2,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Pull command should handle parameters correctly'
        );

        console.log('Pull command with parameters completed successfully');
    });

    test('Push Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testCollectionsPath = path.join(TEST_RUN_DIR, 'collections-push-command-test');
        cleanupTestDirectory(testCollectionsPath);

        const actualCollectionsPath = path.join(testCollectionsPath, 'collections');
        fs.mkdirSync(actualCollectionsPath, { recursive: true });

        const testCollectionData = {
            title: 'Command Test Collection',
            body_html: '<p>Test collection for command testing</p>',
            sort_order: 'alpha-asc',
            template_suffix: null
        };

        fs.writeFileSync(path.join(actualCollectionsPath, 'command-test-collection.json'), JSON.stringify(testCollectionData, null, 2));

        await assert.doesNotReject(
            async () => {
                await collectionsPushCommand({
                    input: testCollectionsPath,
                    dryRun: true,
                    mirror: false,
                    site: creds.site,
                    accessToken: creds.accessToken
                });
            },
            'Push command should handle parameters correctly'
        );

        console.log('Push command with parameters completed successfully');
    });
});

console.log('Running Collections Test Suite...\n');
