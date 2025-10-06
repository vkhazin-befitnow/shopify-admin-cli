/**
 * Files Test Suite
 * 
 * Tests core functionality of the ShopifyFiles class
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { ShopifyFiles } from '../src/commands/files';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

describe('ShopifyFiles', () => {
    let files: ShopifyFiles;
    const testOutputPath = path.join(__dirname, 'test-run', 'files-test');

    beforeEach(() => {
        files = new ShopifyFiles();
        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    });

    test('should prepare output directory', () => {
        const result = (files as any).prepareOutputDirectory(testOutputPath);

        assert.strictEqual(result, path.join(testOutputPath, 'files'));
        assert.ok(fs.existsSync(result));
    });

    test('should extract filename from URL', () => {
        const file = {
            id: 'gid://shopify/MediaImage/123',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            image: {
                url: 'https://cdn.shopify.com/files/test-image.jpg?v=123456'
            }
        };

        const fileName = (files as any).getFileName(file);

        assert.strictEqual(fileName, 'test-image.jpg');
    });

    test('should construct local file path', () => {
        const file = {
            id: 'gid://shopify/GenericFile/123',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            url: 'https://cdn.shopify.com/files/test.jpg'
        };

        const localPath = (files as any).getFileLocalPath(testOutputPath, file);

        assert.strictEqual(localPath, path.join(testOutputPath, 'test.jpg'));
    });

    test('should collect local files from directory', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'image1.jpg'), 'content1');
        fs.writeFileSync(path.join(filesPath, 'image2.png'), 'content2');
        fs.writeFileSync(path.join(filesPath, 'doc.pdf'), 'content3');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 3);
    });

    test('should identify files to delete in mirror mode', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'keep.jpg'), 'content1');
        fs.writeFileSync(path.join(filesPath, 'delete.jpg'), 'content2');

        const remoteFileNames = new Set(['keep.jpg']);
        const toDelete = (files as any).findLocalFilesToDelete(filesPath, remoteFileNames);

        assert.deepStrictEqual(toDelete, ['delete.jpg']);
    });

    test('should delete specified files', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        const file1 = path.join(filesPath, 'delete.jpg');
        const file2 = path.join(filesPath, 'keep.jpg');
        
        fs.writeFileSync(file1, 'content1');
        fs.writeFileSync(file2, 'content2');

        (files as any).deleteLocalFiles(filesPath, ['delete.jpg']);

        assert.strictEqual(fs.existsSync(file1), false);
        assert.strictEqual(fs.existsSync(file2), true);
    });

    test('should collect files with metadata', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'image1.jpg'), 'content1');
        const metadata = {
            id: 'gid://shopify/MediaImage/123',
            alt: 'Product hero image',
            createdAt: '2024-01-15T10:30:00Z',
            fileStatus: 'READY',
            contentType: 'IMAGE'
        };
        fs.writeFileSync(path.join(filesPath, 'image1.jpg.meta'), yaml.dump(metadata), 'utf8');
        
        fs.writeFileSync(path.join(filesPath, 'image2.jpg'), 'content2');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 2);
        assert.ok(localFiles[0].metadata || localFiles[1].metadata);
        const fileWithMeta = localFiles.find((f: any) => f.fileName === 'image1.jpg');
        assert.strictEqual(fileWithMeta?.metadata?.alt, 'Product hero image');
    });

    test('should preserve alt text through collection', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        const testAlt = 'Organic cotton t-shirt in navy blue';
        fs.writeFileSync(path.join(filesPath, 'product.jpg'), 'image-content');
        const metadata = {
            id: 'gid://shopify/MediaImage/456',
            alt: testAlt,
            createdAt: '2024-01-20T14:00:00Z',
            fileStatus: 'READY',
            contentType: 'IMAGE'
        };
        fs.writeFileSync(path.join(filesPath, 'product.jpg.meta'), yaml.dump(metadata), 'utf8');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 1);
        assert.strictEqual(localFiles[0].metadata?.alt, testAlt);
        assert.notStrictEqual(localFiles[0].metadata?.alt, 'product.jpg');
    });

    test('should fallback to filename when no metadata exists', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'product.jpg'), 'image-content');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 1);
        assert.strictEqual(localFiles[0].metadata, undefined);
    });

    test('should skip .meta files in collection', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'image.jpg'), 'content');
        fs.writeFileSync(path.join(filesPath, 'image.jpg.meta'), 'metadata');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 1);
        assert.strictEqual(localFiles[0].fileName, 'image.jpg');
    });

    test('should skip .meta files in mirror mode deletion', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'keep.jpg'), 'content1');
        fs.writeFileSync(path.join(filesPath, 'keep.jpg.meta'), 'metadata1');
        fs.writeFileSync(path.join(filesPath, 'delete.jpg'), 'content2');
        fs.writeFileSync(path.join(filesPath, 'delete.jpg.meta'), 'metadata2');

        const remoteFileNames = new Set(['keep.jpg']);
        const toDelete = (files as any).findLocalFilesToDelete(filesPath, remoteFileNames);

        assert.deepStrictEqual(toDelete, ['delete.jpg']);
        assert.ok(!toDelete.includes('keep.jpg.meta'));
        assert.ok(!toDelete.includes('delete.jpg.meta'));
    });

    test('should delete .meta file when deleting main file', () => {
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        const file = path.join(filesPath, 'delete.jpg');
        const metaFile = path.join(filesPath, 'delete.jpg.meta');
        
        fs.writeFileSync(file, 'content');
        fs.writeFileSync(metaFile, 'metadata');

        (files as any).deleteLocalFiles(filesPath, ['delete.jpg']);

        assert.strictEqual(fs.existsSync(file), false);
        assert.strictEqual(fs.existsSync(metaFile), false);
    });

    test('should determine content type correctly', () => {
        const imageFile = {
            id: 'gid://shopify/MediaImage/1',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            image: { url: 'https://example.com/image.jpg' }
        };
        
        const videoFile = {
            id: 'gid://shopify/Video/2',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            sources: [{ url: 'https://example.com/video.mp4' }]
        };
        
        const genericFile = {
            id: 'gid://shopify/GenericFile/3',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            url: 'https://example.com/document.pdf'
        };

        assert.strictEqual((files as any).determineContentType(imageFile), 'IMAGE');
        assert.strictEqual((files as any).determineContentType(videoFile), 'VIDEO');
        assert.strictEqual((files as any).determineContentType(genericFile), 'FILE');
    });
});
