import * as fs from 'fs';
import * as path from 'path';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { getCredentialsFromEnv } from '../utils/auth';
import { IOUtility } from '../utils/io';

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

export class ShopifyPages {
    constructor() { }

    async pull(outputPath: string, site: string, accessToken: string, maxPages?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull pages${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'pages');
        console.log(`${dryRun ? 'Would pull' : 'Pulling'} pages to: ${finalOutputPath}`);
        
        if (!dryRun) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        let pages = await this.fetchPages(site, accessToken);

        if (maxPages && maxPages > 0) {
            pages = pages.slice(0, maxPages);
            console.log(`Limited to first ${pages.length} pages for testing`);
        } else {
            console.log(`Found ${pages.length} remote pages to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remotePageHandles = new Set(pages.map(page => `${page.handle}.html`));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remotePageHandles));
            
            if (toDelete.length > 0) {
                console.log(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Pages to sync: ${pages.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Local files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach((file: string) => console.log(`  - ${file}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        if (mirror && toDelete.length > 0) {
            this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        if (pages.length > 0) {
            await this.downloadPages(pages, finalOutputPath);
        } else {
            console.log('No pages to sync');
        }

        console.log(`Successfully pulled pages to ${finalOutputPath}`);
    }

    async push(inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push pages${mirror ? ' (Mirror Mode)' : ''}`);

        const pagesPath = this.resolvePagesPath(inputPath);
        console.log(`${dryRun ? 'Would push' : 'Pushing'} local pages from "${pagesPath}"`);

        const localFiles = this.collectLocalPageFiles(pagesPath);

        const remotePages = await this.fetchPages(site, accessToken);

        const toDelete: Array<{ key: string, page: Page }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remotePages.forEach(remotePage => {
                if (!localFileMap.has(remotePage.handle)) {
                    toDelete.push({ key: `${remotePage.handle}.html`, page: remotePage });
                }
            });

            if (toDelete.length > 0) {
                console.log(`Mirror mode: ${toDelete.length} remote pages will be deleted`);
            }
        }

        console.log(`Found ${localFiles.length} local pages to upload`);

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Pages to upload: ${localFiles.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Remote pages to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach(item => console.log(`  - ${item.key}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more pages`);
                }
            }
            return;
        }

        if (localFiles.length > 0) {
            await this.uploadPages(site, accessToken, localFiles);
        } else {
            console.log('No pages to upload');
        }

        if (mirror && toDelete.length > 0) {
            await this.deletePages(site, accessToken, toDelete.map(item => item.page));
        }

        console.log('Successfully pushed pages');
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
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has read_online_store_pages scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            const result: PageListResult = await response.json();
            return result.pages;
        }, SHOPIFY_API.RETRY_CONFIG);
    }


    private getPageFilePath(outputPath: string, page: Page): string {
        return path.join(outputPath, `${page.handle}.html`);
    }

    private findLocalFilesToDelete(outputPath: string, remotePageHandles: Set<string>): string[] {
        const toDelete: string[] = [];

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        const files = fs.readdirSync(outputPath, { withFileTypes: true });

        files.forEach(file => {
            if (file.isFile() && file.name.endsWith('.html')) {
                if (!remotePageHandles.has(file.name)) {
                    toDelete.push(file.name);
                }
            }
        });

        return toDelete;
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): void {
        filesToDelete.forEach(file => {
            const filePath = path.join(outputPath, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`Deleted local file: ${file}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete ${file}: ${message}`);
            }
        });
    }

    private async downloadPages(pages: Page[], outputPath: string): Promise<void> {
        const rateLimitedDownload = RetryUtility.rateLimited(
            (page: Page) => this.downloadSinglePage(page, outputPath),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            console.log(`Downloading (${i + 1}/${pages.length}): ${page.handle}.html`);

            try {
                await rateLimitedDownload(page);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to download ${page.handle}: ${message}`);
            }
        }
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
        const hasHtmlFiles = entries.some(entry => entry.endsWith('.html'));

        if (!hasHtmlFiles) {
            throw new Error(`No HTML files found in directory: ${pagesPath}`);
        }

        return pagesPath;
    }

    private collectLocalPageFiles(inputPath: string): Array<{ handle: string, filePath: string }> {
        const files: Array<{ handle: string, filePath: string }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && entry.name.endsWith('.html')) {
                const handle = entry.name.replace('.html', '');
                const filePath = path.join(inputPath, entry.name);
                files.push({ handle, filePath });
            }
        });

        return files;
    }

    private async uploadPages(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, pageId?: number }>): Promise<void> {
        const rateLimitedUpload = RetryUtility.rateLimited(
            (file: { handle: string, filePath: string, pageId?: number }) => this.uploadSinglePage(site, accessToken, file),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Uploading (${i + 1}/${files.length}): ${file.handle}.html`);

            try {
                await rateLimitedUpload(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to upload ${file.handle}: ${message}`);
            }
        }
    }

    private async uploadSinglePage(site: string, accessToken: string, file: { handle: string, filePath: string, pageId?: number }): Promise<void> {
        const bodyHtml = fs.readFileSync(file.filePath, 'utf8');

        const pageData: Partial<Page> = {
            title: file.handle,
            handle: file.handle,
            body_html: bodyHtml
        };

        const url = file.pageId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(file.pageId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        const method = file.pageId ? 'PUT' : 'POST';

        await this.makeRequest(url, method, { page: pageData }, {
            'X-Shopify-Access-Token': accessToken
        });
    }

    private async deletePages(site: string, accessToken: string, pages: Page[]): Promise<void> {
        const rateLimitedDelete = RetryUtility.rateLimited(
            (page: Page) => this.deleteSinglePage(site, accessToken, page),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            console.log(`Deleting (${i + 1}/${pages.length}): ${page.handle}`);

            try {
                await rateLimitedDelete(page);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete ${page.handle}: ${message}`);
            }
        }
    }

    private async deleteSinglePage(site: string, accessToken: string, page: Page): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(page.id)}`;

        await this.makeRequest(url, 'DELETE', {}, {
            'X-Shopify-Access-Token': accessToken
        });
    }

    private async makeRequest(url: string, method: string, body: any, headers: Record<string, string>): Promise<Response> {
        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: method !== 'DELETE' ? JSON.stringify(body) : undefined
            });

            if (response.status === 401) {
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has write_online_store_pages scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return response;
        }, SHOPIFY_API.RETRY_CONFIG);
    }
}

// Export command functions to match the theme pattern
export async function pagesPullCommand(options: any): Promise<void> {
    const pages = new ShopifyPages();
    const credentials = getCredentialsFromEnv();

    let finalSite = options.site;
    let finalAccessToken = options.accessToken;

    if (!finalSite || !finalAccessToken) {
        if (credentials) {
            finalSite = finalSite || credentials.site;
            finalAccessToken = finalAccessToken || credentials.accessToken;
        }
    }

    if (!finalSite || !finalAccessToken) {
        throw new Error('Missing credentials. Provide either:\n' +
            '1. CLI arguments: --site <domain> --access-token <token>\n' +
            '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    if (!options.output) {
        throw new Error('Output path is required. Use --output <path>');
    }

    await pages.pull(
        options.output,
        finalSite,
        finalAccessToken,
        options.maxPages,
        options.dryRun,
        options.mirror
    );
}

export async function pagesPushCommand(options: any): Promise<void> {
    const pages = new ShopifyPages();
    const credentials = getCredentialsFromEnv();

    let finalSite = options.site;
    let finalAccessToken = options.accessToken;

    if (!finalSite || !finalAccessToken) {
        if (credentials) {
            finalSite = finalSite || credentials.site;
            finalAccessToken = finalAccessToken || credentials.accessToken;
        }
    }

    if (!finalSite || !finalAccessToken) {
        throw new Error('Missing credentials. Provide either:\n' +
            '1. CLI arguments: --site <domain> --access-token <token>\n' +
            '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    if (!options.input) {
        throw new Error('Input path is required. Use --input <path>');
    }

    await pages.push(
        options.input,
        finalSite,
        finalAccessToken,
        options.dryRun,
        options.mirror
    );
}
