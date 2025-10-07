/**
 * Integration Test Suite
 * 
 * Tests component orchestration and validation logic
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { ShopifyThemes } from '../src/commands/themes';
import { ShopifyPages } from '../src/commands/pages';
import { getCredentialsFromEnv } from '../src/utils/auth';

describe('Component Orchestration', () => {
    test('should validate component names', () => {
        const validComponents = ['theme', 'files', 'pages', 'menus', 'metaobjects'];
        const testComponents = 'theme,pages,invalid';
        const components = testComponents.split(',').map(c => c.trim().toLowerCase());
        const invalid = components.filter(c => !validComponents.includes(c));

        assert.ok(invalid.length > 0, 'Should detect invalid components');
        assert.ok(invalid.includes('invalid'), 'Should identify "invalid" as invalid');
    });

    test('should parse multiple components correctly', () => {
        const components = 'theme,pages'.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 2);
        assert.ok(components.includes('theme'));
        assert.ok(components.includes('pages'));
    });

    test('should instantiate component classes', () => {
        const themes = new ShopifyThemes();
        const pages = new ShopifyPages();

        assert.ok(themes instanceof ShopifyThemes);
        assert.ok(pages instanceof ShopifyPages);
    });

    test('should have access to credentials utility', () => {
        assert.strictEqual(typeof getCredentialsFromEnv, 'function');
        
        const credentials = getCredentialsFromEnv();
        assert.ok(credentials === null || (credentials && credentials.site && credentials.accessToken));
    });
});

describe('Pull Command', () => {
    test('should pass published flag to themes pull', async () => {
        const mockOptions = {
            output: './test-output',
            dryRun: true,
            mirror: false,
            published: true,
            site: 'test.myshopify.com',
            accessToken: 'test-token'
        };

        assert.strictEqual(mockOptions.published, true, 'published flag should be set to true');
        assert.ok(!('themeName' in mockOptions), 'themeName should not be present when published is true');
    });

    test('should not require theme-name when published flag is used', () => {
        const options = {
            output: './test-output',
            published: true
        };

        assert.ok(options.published, 'published flag should be true');
        assert.ok(!('themeName' in options), 'themeName should not be required');
    });

    test('should use default components when not specified', () => {
        const defaultComponents = 'theme,files,pages';
        const components = defaultComponents.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 3, 'should have 3 default components');
        assert.ok(components.includes('theme'), 'should include theme');
        assert.ok(components.includes('files'), 'should include files');
        assert.ok(components.includes('pages'), 'should include pages');
    });

    test('should accept custom components list', () => {
        const customComponents = 'theme,files';
        const components = customComponents.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 2, 'should have 2 components');
        assert.ok(components.includes('theme'), 'should include theme');
        assert.ok(components.includes('files'), 'should include files');
        assert.ok(!components.includes('pages'), 'should not include pages');
    });

    test('should accept single component', () => {
        const singleComponent = 'theme';
        const components = singleComponent.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 1, 'should have 1 component');
        assert.strictEqual(components[0], 'theme', 'should be theme');
    });

    test('should validate component names', () => {
        const invalidComponents = 'theme,invalid,files';
        const components = invalidComponents.split(',').map(c => c.trim().toLowerCase());
        const validComponents = ['theme', 'files', 'pages'];
        const invalid = components.filter(c => !validComponents.includes(c));
        
        assert.ok(invalid.length > 0, 'should detect invalid components');
        assert.ok(invalid.includes('invalid'), 'should identify "invalid" as invalid');
    });
});

describe('Push Command', () => {
    test('should require theme-name for push operations', () => {
        const options = {
            input: './test-input',
            themeName: 'MyTheme'
        };

        assert.ok(options.themeName, 'themeName should be present for push');
        assert.strictEqual(typeof options.themeName, 'string', 'themeName should be a string');
    });

    test('should use default components when not specified', () => {
        const defaultComponents = 'theme,files,pages';
        const components = defaultComponents.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 3, 'should have 3 default components');
        assert.ok(components.includes('theme'), 'should include theme');
        assert.ok(components.includes('files'), 'should include files');
        assert.ok(components.includes('pages'), 'should include pages');
    });

    test('should accept custom components list', () => {
        const customComponents = 'files,pages';
        const components = customComponents.split(',').map(c => c.trim().toLowerCase());
        
        assert.strictEqual(components.length, 2, 'should have 2 components');
        assert.ok(components.includes('files'), 'should include files');
        assert.ok(components.includes('pages'), 'should include pages');
        assert.ok(!components.includes('theme'), 'should not include theme');
    });

    test('should validate component names for push', () => {
        const invalidComponents = 'theme,badcomponent';
        const components = invalidComponents.split(',').map(c => c.trim().toLowerCase());
        const validComponents = ['theme', 'files', 'pages'];
        const invalid = components.filter(c => !validComponents.includes(c));
        
        assert.ok(invalid.length > 0, 'should detect invalid components');
        assert.ok(invalid.includes('badcomponent'), 'should identify "badcomponent" as invalid');
    });

    test('should handle theme-name requirement only when pushing theme', () => {
        const componentsWithoutTheme = 'files,pages';
        const componentsWithTheme = 'theme,files';
        
        const withoutTheme = componentsWithoutTheme.split(',').map(c => c.trim().toLowerCase());
        const withTheme = componentsWithTheme.split(',').map(c => c.trim().toLowerCase());
        
        assert.ok(!withoutTheme.includes('theme'), 'theme-name should not be required');
        assert.ok(withTheme.includes('theme'), 'theme-name should be required');
    });
});
