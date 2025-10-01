/**
 * Files Test Suite
 * 
 * Tests core functionality of the ShopifyFiles class
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { ShopifyFiles } from '../src/commands/files';
import * as fs from 'fs';
import * as path from 'path';

describe('ShopifyFiles', () => {
    let files: ShopifyFiles;
    const testOutputPath = path.join(__dirname, 'test-run', 'files-test');

    const setup = () => {
        files = new ShopifyFiles();
        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    };

    const teardown = () => {
        if (fs.existsSync(testOutputPath)) {
            fs.rmSync(testOutputPath, { recursive: true, force: true });
        }
    };

    test('should prepare output directory', () => {
        setup();
        const result = (files as any).prepareOutputDirectory(testOutputPath);

        assert.strictEqual(result, path.join(testOutputPath, 'files'));
        assert.ok(fs.existsSync(result));
        teardown();
    });

    test('should extract filename from URL', () => {
        setup();
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
        teardown();
    });

    test('should construct local file path', () => {
        setup();
        const file = {
            id: 'gid://shopify/GenericFile/123',
            alt: 'test',
            createdAt: '2024-01-01',
            fileStatus: 'READY',
            url: 'https://cdn.shopify.com/files/test.jpg'
        };

        const localPath = (files as any).getFileLocalPath(testOutputPath, file);

        assert.strictEqual(localPath, path.join(testOutputPath, 'test.jpg'));
        teardown();
    });

    test('should collect local files from directory', () => {
        setup();
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'image1.jpg'), 'content1');
        fs.writeFileSync(path.join(filesPath, 'image2.png'), 'content2');
        fs.writeFileSync(path.join(filesPath, 'doc.pdf'), 'content3');

        const localFiles = (files as any).collectLocalFiles(filesPath);

        assert.strictEqual(localFiles.length, 3);
        teardown();
    });

    test('should resolve files path', () => {
        setup();
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        fs.writeFileSync(path.join(filesPath, 'test.jpg'), 'content');

        const result = (files as any).resolveFilesPath(testOutputPath);

        assert.strictEqual(result, filesPath);
        teardown();
    });

    test('should identify files to delete in mirror mode', () => {
        setup();
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        fs.writeFileSync(path.join(filesPath, 'keep.jpg'), 'content1');
        fs.writeFileSync(path.join(filesPath, 'delete.jpg'), 'content2');

        const remoteFileNames = new Set(['keep.jpg']);
        const toDelete = (files as any).findLocalFilesToDelete(filesPath, remoteFileNames);

        assert.deepStrictEqual(toDelete, ['delete.jpg']);
        teardown();
    });

    test('should delete specified files', () => {
        setup();
        const filesPath = path.join(testOutputPath, 'files');
        fs.mkdirSync(filesPath, { recursive: true });
        
        const file1 = path.join(filesPath, 'delete.jpg');
        const file2 = path.join(filesPath, 'keep.jpg');
        
        fs.writeFileSync(file1, 'content1');
        fs.writeFileSync(file2, 'content2');

        (files as any).deleteLocalFiles(filesPath, ['delete.jpg']);

        assert.strictEqual(fs.existsSync(file1), false);
        assert.strictEqual(fs.existsSync(file2), true);
        teardown();
    });
});
