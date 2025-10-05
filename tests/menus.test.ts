/**
 * Menus Test Suite
 * 
 * Tests core Shopify Menus functionality with real API calls.
 * Requires: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyMenus } from '../src/commands/menus';

const TEST_RUN_DIR = path.join(__dirname, 'test-run');

function getCredentials(): { site: string; accessToken: string } | null {
    if (process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN) {
        return {
            site: process.env.SHOPIFY_STORE_DOMAIN,
            accessToken: process.env.SHOPIFY_ACCESS_TOKEN
        };
    }
    return null;
}

function cleanupTestDirectory(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

describe('Shopify Menus', () => {
    const menus = new ShopifyMenus();

    test('Pull and Push Menus', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Credentials required');

        const testPath = path.join(TEST_RUN_DIR, 'menus-basic-test');
        cleanupTestDirectory(testPath);

        await menus.pull(testPath, creds.site, creds.accessToken, 1);

        const menusPath = path.join(testPath, 'menus');
        assert.ok(fs.existsSync(menusPath), 'Menus folder should exist');

        const jsonFiles = fs.readdirSync(menusPath).filter(f => f.endsWith('.json'));
        assert.ok(jsonFiles.length > 0, 'Should have menu files');

        await menus.push(testPath, creds.site, creds.accessToken, false);

        console.log('Pull and push completed successfully');
    });

    test('Push with Validation Errors Should Fail', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Credentials required');

        const testPath = path.join(TEST_RUN_DIR, 'menus-validation-test');
        cleanupTestDirectory(testPath);

        const menusPath = path.join(testPath, 'menus');
        fs.mkdirSync(menusPath, { recursive: true });

        // Create a menu with an invalid page link that should cause validation errors
        const invalidMenu = [
            { id: '', title: 'Home', url: '/', type: 'FRONTPAGE' },
            { id: '', title: 'Invalid', url: '/pages/nonexistent', type: 'PAGE' }
        ];

        fs.writeFileSync(
            path.join(menusPath, 'test-menu.json'),
            JSON.stringify(invalidMenu, null, 2)
        );

        // This test verifies that push operations with validation errors properly fail
        // The push should attempt retries then ultimately throw an error
        let errorCaught = false;
        let errorMessage = '';

        try {
            await menus.push(testPath, creds.site, creds.accessToken, false);
            // If we reach here, the push succeeded when it should have failed
            assert.fail('Push operation should have failed due to validation errors');
        } catch (error) {
            errorCaught = true;
            errorMessage = error instanceof Error ? error.message : String(error);

            // Verify the error is related to push failure
            assert.ok(
                errorMessage.includes('Push failed') || errorMessage.includes('failed to upload'),
                `Expected push failure error, but got: ${errorMessage}`
            );
        }

        assert.ok(errorCaught, 'Expected validation error to be thrown');
        console.log('Validation error handling verified - push correctly failed with:', errorMessage);
    });

    test('Validation Errors Should Immediately Fail Push (Not Retry)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Credentials required');

        const testPath = path.join(TEST_RUN_DIR, 'menus-immediate-fail-test');
        cleanupTestDirectory(testPath);

        const menusPath = path.join(testPath, 'menus');
        fs.mkdirSync(menusPath, { recursive: true });

        const invalidMenu = [
            { id: '', title: 'Home', url: '/', type: 'FRONTPAGE' },
            { id: '', title: 'Invalid', url: '/pages/nonexistent', type: 'PAGE' }
        ];

        fs.writeFileSync(
            path.join(menusPath, 'should-fail-immediately.json'),
            JSON.stringify(invalidMenu, null, 2)
        );

        const startTime = Date.now();

        try {
            await menus.push(testPath, creds.site, creds.accessToken, false);
            assert.fail('Push should have failed immediately on validation errors');
        } catch (error) {
            const duration = Date.now() - startTime;

            // This test exposes the issue: validation errors trigger retries (3+ seconds)
            // instead of failing immediately as they should for validation issues
            if (duration > 2000) {
                console.log(`ISSUE EXPOSED: Validation errors caused retries (${duration}ms) instead of immediate failure`);
                assert.fail(`Validation errors should fail immediately, not after ${duration}ms of retries. This indicates the system is treating validation errors as transient failures.`);
            } else {
                console.log('Validation errors correctly failed immediately');
            }
        }
    });
});

console.log('Running Menus Test Suite...\n');
