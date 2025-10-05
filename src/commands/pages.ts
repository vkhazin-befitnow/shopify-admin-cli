import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { HttpClient } from '../utils/http-client';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

interface Page {
    id: number;
    title: string;
    handle: string;
    body_html: string;
    author: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
    template_suffix?: string;
    summary_html?: string;
}

interface PageListResult {
    pages: Page[];
}

interface PageMetadata {
    id: number;
    title: string;
    handle: string;
    author: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
    template_suffix?: string;
}

export interface PagesPullOptions {
    output: string;
    maxPages?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface PagesPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyPages {
    private static readonly HTML_EXTENSION = '.html';
    private static readonly META_EXTENSION = '.meta';

    private httpClient = new HttpClient();

    async pull(outputPath: string, site: string, accessToken: string, maxPages?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull pages${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'pages');
        dryRunManager.logAction('pull', `pages to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        let pages = await this.fetchPages(site, accessToken);

        if (maxPages && maxPages > 0) {
            pages = pages.slice(0, maxPages);
            Logger.info(`Limited to first ${pages.length} pages for testing`);
        } else {
            Logger.info(`Found ${pages.length} remote pages to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remotePageHandles = new Set(pages.map(page => `${page.handle}${ShopifyPages.HTML_EXTENSION}`));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remotePageHandles));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: pages.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Pages'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };
        if (pages.length > 0) {
            Object.assign(downloadResult, await this.downloadPages(pages, finalOutputPath));
        } else {
            Logger.info('No pages to sync');
        }

        const summary = [`Successfully pulled pages to ${finalOutputPath}`];
        if (downloadResult.downloaded > 0) {
            summary.push(`Downloaded: ${downloadResult.downloaded}`);
        }
        if (deletedCount > 0) {
            summary.push(`Deleted: ${deletedCount}`);
        }
        if (downloadResult.failed > 0) {
            summary.push(`Failed: ${downloadResult.failed}`);
        }

        Logger.success(summary.join(' | '));

        if (downloadResult.errors.length > 0) {
            Logger.warn(`\nErrors encountered during pull:`);
            downloadResult.errors.forEach(error => Logger.warn(`  - ${error}`));
        }
    }

    async push(inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push pages${mirror ? ' (Mirror Mode)' : ''}`);

        const pagesPath = this.resolvePagesPath(inputPath);
        dryRunManager.logAction('push', `local pages from "${pagesPath}"`);

        const localFiles = this.collectLocalPageFiles(pagesPath);

        const remotePages = await this.fetchPages(site, accessToken);

        const toDelete: Array<{ key: string, page: Page }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remotePages.forEach(remotePage => {
                if (!localFileMap.has(remotePage.handle)) {
                    toDelete.push({ key: `${remotePage.handle}${ShopifyPages.HTML_EXTENSION}`, page: remotePage });
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote pages will be deleted`);
            }
        }

        Logger.info(`Found ${localFiles.length} local pages to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(item => item.key),
            itemType: 'Pages'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };
        if (localFiles.length > 0) {
            Object.assign(uploadResult, await this.uploadPages(site, accessToken, localFiles));
        } else {
            Logger.info('No pages to upload');
        }

        const deleteResult = { deleted: 0, failed: 0, errors: [] as string[] };
        if (mirror && toDelete.length > 0) {
            Object.assign(deleteResult, await this.deletePages(site, accessToken, toDelete.map(item => item.page)));
        }

        const summary = ['Successfully pushed pages'];
        if (uploadResult.uploaded > 0) {
            summary.push(`Uploaded: ${uploadResult.uploaded}`);
        }
        if (deleteResult.deleted > 0) {
            summary.push(`Deleted: ${deleteResult.deleted}`);
        }
        if (uploadResult.failed > 0 || deleteResult.failed > 0) {
            summary.push(`Failed: ${uploadResult.failed + deleteResult.failed}`);
        }

        Logger.success(summary.join(' | '));

        const allErrors = [...uploadResult.errors, ...deleteResult.errors];
        if (allErrors.length > 0) {
            Logger.warn(`\nErrors encountered during push:`);
            allErrors.forEach(error => Logger.warn(`  - ${error}`));
        }
    }

    private async fetchPages(site: string, accessToken: string): Promise<Page[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to fetch pages list: Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to fetch pages list: Forbidden - missing required permissions. Ensure your app has read_online_store_pages scope.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch pages list: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result: PageListResult = await response.json();
            return result.pages;
        }, SHOPIFY_API.RETRY_CONFIG);
    }


    private getPageFilePath(outputPath: string, page: Page): string {
        return path.join(outputPath, `${page.handle}${ShopifyPages.HTML_EXTENSION}`);
    }

    private findLocalFilesToDelete(outputPath: string, remotePageHandles: Set<string>): string[] {
        const toDelete: string[] = [];

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        const files = fs.readdirSync(outputPath, { withFileTypes: true });

        files.forEach(file => {
            if (file.isFile() && file.name.endsWith(ShopifyPages.HTML_EXTENSION)) {
                if (!remotePageHandles.has(file.name)) {
                    toDelete.push(file.name);
                    const metaFile = `${file.name}${ShopifyPages.META_EXTENSION}`;
                    if (files.some(f => f.name === metaFile)) {
                        toDelete.push(metaFile);
                    }
                }
            }
        });

        return toDelete;
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
        let deletedCount = 0;
        filesToDelete.forEach(file => {
            const filePath = path.join(outputPath, file);
            try {
                fs.unlinkSync(filePath);
                Logger.info(`Deleted local file: ${file}`);
                deletedCount++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to delete ${file}: ${message}`);
            }
        });
        return deletedCount;
    }

    private async downloadPages(pages: Page[], outputPath: string): Promise<{ downloaded: number, failed: number, errors: string[] }> {
        const result = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            Logger.progress(i + 1, pages.length, `Downloading ${page.handle}${ShopifyPages.HTML_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.downloadSinglePage(page, outputPath),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.downloaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${page.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${page.handle}: ${message}`);
            }
        }

        return result;
    }

    private async downloadSinglePage(page: Page, outputPath: string): Promise<void> {
        const filePath = this.getPageFilePath(outputPath, page);

        // Ensure the directory for this file exists
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Save page HTML as-is from Shopify
        fs.writeFileSync(filePath, page.body_html || '', 'utf8');

        // Save page metadata for future updates
        const metadata: PageMetadata = {
            id: page.id,
            title: page.title,
            handle: page.handle,
            author: page.author,
            created_at: page.created_at,
            updated_at: page.updated_at,
            published_at: page.published_at,
            template_suffix: page.template_suffix
        };
        const metaPath = `${filePath}${ShopifyPages.META_EXTENSION}`;
        fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
    }

    private resolvePagesPath(basePath: string): string {
        const pagesPath = IOUtility.buildResourcePath(basePath, 'pages');

        if (!fs.existsSync(pagesPath)) {
            throw new Error(
                `Pages directory not found: ${pagesPath}\n` +
                `Expected structure: ${basePath}/pages/`
            );
        }

        const entries = fs.readdirSync(pagesPath);
        const hasHtmlFiles = entries.some(entry => entry.endsWith(ShopifyPages.HTML_EXTENSION));

        if (!hasHtmlFiles) {
            throw new Error(`No HTML files found in directory: ${pagesPath}`);
        }

        return pagesPath;
    }

    private collectLocalPageFiles(inputPath: string): Array<{ handle: string, filePath: string, pageId?: number }> {
        const files: Array<{ handle: string, filePath: string, pageId?: number }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && entry.name.endsWith(ShopifyPages.HTML_EXTENSION)) {
                const handle = entry.name.replace(ShopifyPages.HTML_EXTENSION, '');
                const filePath = path.join(inputPath, entry.name);
                const metaPath = `${filePath}${ShopifyPages.META_EXTENSION}`;

                let pageId: number | undefined;
                if (fs.existsSync(metaPath)) {
                    try {
                        const metaContent = fs.readFileSync(metaPath, 'utf8');
                        const metadata = yaml.load(metaContent) as PageMetadata;
                        pageId = metadata.id;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        Logger.warn(`Failed to read metadata for ${entry.name}: ${message}`);
                    }
                }

                files.push({ handle, filePath, pageId });
            }
        });

        return files;
    }

    private async uploadPages(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, pageId?: number }>): Promise<{ uploaded: number, failed: number, errors: string[] }> {
        const result = { uploaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(i + 1, files.length, `Uploading ${file.handle}${ShopifyPages.HTML_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.uploadSinglePage(site, accessToken, file),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.uploaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to upload ${file.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${file.handle}: ${message}`);
            }
        }

        return result;
    }

    private async uploadSinglePage(site: string, accessToken: string, file: { handle: string, filePath: string, pageId?: number }): Promise<void> {
        const bodyHtml = fs.readFileSync(file.filePath, 'utf8');

        const pageData: Partial<Page> = {
            title: file.handle,
            handle: file.handle,
            body_html: bodyHtml
        };

        const metaPath = `${file.filePath}${ShopifyPages.META_EXTENSION}`;
        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metadata = yaml.load(metaContent) as PageMetadata;

                if (metadata.title) {
                    pageData.title = metadata.title;
                }
                if (metadata.template_suffix !== undefined) {
                    pageData.template_suffix = metadata.template_suffix;
                }
                if (metadata.published_at !== undefined) {
                    pageData.published_at = metadata.published_at;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to read metadata for ${file.handle}, using defaults: ${message}`);
            }
        }

        const url = file.pageId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(file.pageId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        const method = file.pageId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { page: pageData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'pages'
        });
    }

    private async deletePages(site: string, accessToken: string, pages: Page[]): Promise<{ deleted: number, failed: number, errors: string[] }> {
        const result = { deleted: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            Logger.progress(i + 1, pages.length, `Deleting ${page.handle}`);

            try {
                await RetryUtility.withRetry(
                    () => this.deleteSinglePage(site, accessToken, page),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.deleted++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to delete ${page.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${page.handle}: ${message}`);
            }
        }

        return result;
    }

    private async deleteSinglePage(site: string, accessToken: string, page: Page): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(page.id)}`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'pages'
        });
    }


}

export async function pagesPullCommand(options: PagesPullOptions): Promise<void> {
    const pages = new ShopifyPages();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await pages.pull(
        options.output,
        credentials.site,
        credentials.accessToken,
        options.maxPages,
        options.dryRun,
        options.mirror
    );
}

export async function pagesPushCommand(options: PagesPushOptions): Promise<void> {
    const pages = new ShopifyPages();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await pages.push(
        options.input,
        credentials.site,
        credentials.accessToken,
        options.dryRun,
        options.mirror
    );
}
