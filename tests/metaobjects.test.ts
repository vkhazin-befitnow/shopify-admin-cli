import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { ShopifyMetaobjects } from '../src/commands/metaobjects';
import * as fs from 'fs';
import * as path from 'path';

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

describe('Shopify Metaobjects', () => {
    const metaobjects = new ShopifyMetaobjects();
    const testOutputPath = path.join(__dirname, 'test-run', 'metaobjects-test');

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Pull and Push Metaobjects', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }

        await metaobjects.pull(testOutputPath, creds.site, creds.accessToken, 1, false, false);

        const metaobjectsDir = path.join(testOutputPath, 'metaobjects');
        assert.ok(fs.existsSync(metaobjectsDir), 'Metaobjects directory should be created');

        const typeDirs = fs.readdirSync(metaobjectsDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory());
        
        assert.ok(typeDirs.length > 0, 'At least one type directory should exist');

        let hasDefinition = false;
        let hasEntry = false;

        for (const typeDir of typeDirs) {
            const typePath = path.join(metaobjectsDir, typeDir.name);
            const files = fs.readdirSync(typePath);
            
            const definitionFile = files.find(f => f.endsWith('.definition.json'));
            if (definitionFile) {
                hasDefinition = true;
                const defPath = path.join(typePath, definitionFile);
                assert.ok(fs.existsSync(defPath), 'Definition file should exist');
            }

            const entryFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.definition.json'));
            if (entryFiles.length > 0) {
                hasEntry = true;
                const entryPath = path.join(typePath, entryFiles[0]);
                const metaPath = `${entryPath}.meta`;
                assert.ok(fs.existsSync(entryPath), 'Entry file should exist');
                assert.ok(fs.existsSync(metaPath), 'Entry metadata file should exist');
            }
        }

        assert.ok(hasDefinition, 'At least one definition file should exist');
        
        if (hasEntry) {
            await metaobjects.push(testOutputPath, creds.site, creds.accessToken, false, false);
        }

        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    });

    test('Pull with Dry Run', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }

        await metaobjects.pull(testOutputPath, creds.site, creds.accessToken, 1, true, false);

        const metaobjectsDir = path.join(testOutputPath, 'metaobjects');
        assert.strictEqual(fs.existsSync(metaobjectsDir), false, 'Metaobjects directory should not be created in dry run mode');

        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    });

    test('Push with Empty Directory Should Succeed', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const emptyTestPath = path.join(__dirname, 'test-run', 'metaobjects-empty-test');

        if (fs.existsSync(emptyTestPath)) {
            fs.rmSync(emptyTestPath, { recursive: true, force: true });
        }

        const metaobjectsDir = path.join(emptyTestPath, 'metaobjects');
        fs.mkdirSync(metaobjectsDir, { recursive: true });

        await metaobjects.push(emptyTestPath, creds.site, creds.accessToken, false, false);

        console.log('Push with empty directory completed successfully');

        if (fs.existsSync(emptyTestPath)) {
            fs.rmSync(emptyTestPath, { recursive: true, force: true });
        }
    });
});

console.log('Running Metaobjects Test Suite...\n');
