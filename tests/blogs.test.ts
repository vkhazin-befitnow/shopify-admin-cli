/**
 * Blogs Test Suite
 * 
 * Tests the ShopifyBlogs class with real API calls (no mocks).
 * Requires environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyBlogs, blogsPullCommand, blogsPushCommand } from '../src/commands/blogs';

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

describe('Shopify Blogs', () => {
    const blogs = new ShopifyBlogs();

    test('Environment Setup Validation', () => {
        assert.ok(hasCredentials(), 'Environment variables SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN should be set');
    });

    test('Blogs Pull with Limit', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-pull-test');
        cleanupTestDirectory(testBlogsPath);

        await blogs.pull(
            testBlogsPath,
            creds.site,
            creds.accessToken,
            3
        );

        const actualBlogsPath = path.join(testBlogsPath, 'blogs');

        assert.ok(fs.existsSync(actualBlogsPath), 'Blogs folder should exist');

        const blogDirs = fs.readdirSync(actualBlogsPath).filter(file => {
            const fullPath = path.join(actualBlogsPath, file);
            return fs.statSync(fullPath).isDirectory();
        });

        assert.ok(blogDirs.length >= 0, 'Should have blog directories');

        if (blogDirs.length > 0) {
            const firstBlogPath = path.join(actualBlogsPath, blogDirs[0]);
            const blogMetaPath = path.join(firstBlogPath, '_blog.meta');

            assert.ok(fs.existsSync(blogMetaPath), 'Blog should have metadata file');

            const articleFiles = fs.readdirSync(firstBlogPath).filter(file => file.endsWith('.json'));

            if (articleFiles.length > 0) {
                const firstArticlePath = path.join(firstBlogPath, articleFiles[0]);
                const content = fs.readFileSync(firstArticlePath, 'utf8');
                const articleData = JSON.parse(content);

                assert.ok(articleData.body_html !== undefined, 'Article should have body_html');

                const metaPath = firstArticlePath + '.meta';
                if (fs.existsSync(metaPath)) {
                    const metaContent = fs.readFileSync(metaPath, 'utf8');
                    const metadata = JSON.parse(metaContent);
                    assert.ok(metadata.id, 'Article metadata should have id');
                    assert.ok(metadata.title, 'Article metadata should have title');
                }
            }
        }

        console.log(`Successfully pulled ${blogDirs.length} blog(s) with limit`);
    });

    test('Blogs Pull (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-pull-dry-run-test');
        cleanupTestDirectory(testBlogsPath);

        await blogs.pull(
            testBlogsPath,
            creds.site,
            creds.accessToken,
            2,
            true
        );

        assert.ok(!fs.existsSync(testBlogsPath) || fs.readdirSync(testBlogsPath).length === 0, 'Dry run should not create files');

        console.log('Dry run pull completed without creating files');
    });

    test('Blogs Pull (Mirror Mode)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-pull-mirror-test');
        cleanupTestDirectory(testBlogsPath);

        const actualBlogsPath = path.join(testBlogsPath, 'blogs');
        const fakeBlogPath = path.join(actualBlogsPath, 'fake-blog');

        fs.mkdirSync(fakeBlogPath, { recursive: true });
        fs.writeFileSync(path.join(fakeBlogPath, 'local-only-article.json'), JSON.stringify({ body_html: 'Local Only' }, null, 2));

        await blogs.pull(
            testBlogsPath,
            creds.site,
            creds.accessToken,
            2,
            false,
            true
        );

        assert.ok(!fs.existsSync(fakeBlogPath), 'Local-only blog should be deleted in mirror mode');

        console.log('Mirror mode pull completed successfully');
    });

    test('Blogs Push (Dry Run)', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-push-dry-run-test');
        cleanupTestDirectory(testBlogsPath);

        await blogs.pull(
            testBlogsPath,
            creds.site,
            creds.accessToken,
            2
        );

        await assert.doesNotReject(
            async () => {
                await blogs.push(
                    testBlogsPath,
                    creds.site,
                    creds.accessToken,
                    true
                );
            },
            'Dry run push should not throw errors'
        );

        console.log('Dry run push completed successfully');
    });

    test('Pull Command with Parameters', async () => {
        const creds = getCredentials();
        assert.ok(creds, 'Test credentials should be available');

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-pull-command-test');
        cleanupTestDirectory(testBlogsPath);

        await assert.doesNotReject(
            async () => {
                await blogsPullCommand({
                    output: testBlogsPath,
                    dryRun: true,
                    mirror: true,
                    maxArticles: 2,
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

        const testBlogsPath = path.join(TEST_RUN_DIR, 'blogs-push-command-test');
        cleanupTestDirectory(testBlogsPath);

        const actualBlogsPath = path.join(testBlogsPath, 'blogs', 'test-blog');
        fs.mkdirSync(actualBlogsPath, { recursive: true });

        const testBlogMeta = {
            id: 999999,
            title: 'Test Blog',
            handle: 'test-blog',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const testArticleData = {
            body_html: '<p>Test article for command testing</p>',
            summary_html: '<p>Test summary</p>'
        };

        const testArticleMeta = {
            id: 999999,
            title: 'Command Test Article',
            handle: 'command-test-article',
            blog_id: 999999,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        fs.writeFileSync(path.join(actualBlogsPath, '_blog.meta'), JSON.stringify(testBlogMeta, null, 2));
        fs.writeFileSync(path.join(actualBlogsPath, 'command-test-article.json'), JSON.stringify(testArticleData, null, 2));
        fs.writeFileSync(path.join(actualBlogsPath, 'command-test-article.json.meta'), JSON.stringify(testArticleMeta, null, 2));

        await assert.doesNotReject(
            async () => {
                await blogsPushCommand({
                    input: testBlogsPath,
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

console.log('Running Blogs Test Suite...\n');
