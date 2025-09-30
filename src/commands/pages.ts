import * as fs from 'fs';
import * as path from 'path';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';

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

    getCredentialsFromEnv(): { site: string; accessToken: string } | null {
        const site = process.env.SHOPIFY_STORE_DOMAIN;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (site && accessToken) {
            return { site, accessToken };
        }

        return null;
    }

    async pull(outputPath: string, site: string, accessToken: string, maxPages?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull pages${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = this.prepareOutputDirectory(outputPath);
        console.log(`${dryRun ? 'Would pull' : 'Pulling'} pages to: ${finalOutputPath}`);

        let pages = await this.fetchPages(site, accessToken);

        if (maxPages && maxPages > 0) {
            pages = pages.slice(0, maxPages);
            console.log(`Limited to first ${pages.length} pages for testing`);
        } else {
            console.log(`Found ${pages.length} remote pages`);
        }

        // Simple approach: always sync all files for reliability
        const toDownload: Page[] = [];
        const toUpdate: Page[] = [];
        const toDelete: string[] = [];

        // Check each page
        pages.forEach(page => {
            const localFilePath = this.getPageFilePath(finalOutputPath, page);
            if (!fs.existsSync(localFilePath)) {
                toDownload.push(page);
            } else {
                toUpdate.push(page);
            }
        });

        // Find local files to delete (only in mirror mode)
        if (mirror) {
            const remotePageHandles = new Set(pages.map(page => `${page.handle}.html`));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remotePageHandles));
        }

        console.log(`Pages to download: ${toDownload.length} new, ${toUpdate.length} updated, ${pages.length - toDownload.length - toUpdate.length} unchanged`);
        if (mirror && toDelete.length > 0) {
            console.log(`Mirror mode: ${toDelete.length} local files will be deleted`);
        }

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Pages to download (new): ${toDownload.length}`);
            console.log(`Pages to update (modified): ${toUpdate.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Local files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach((file: string) => console.log(`  - ${file}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        // Delete local files not present remotely (only in mirror mode)
        if (mirror && toDelete.length > 0) {
            this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        // Download files that need it (new pages + updated pages)
        const pagesToDownload = [...toDownload, ...toUpdate];
        if (pagesToDownload.length > 0) {
            await this.downloadPages(pagesToDownload, finalOutputPath);
        } else {
            console.log('No pages need to be downloaded - all files are already up to date');
        }

        console.log(`Successfully pulled pages to ${finalOutputPath}`);
    }

    async push(inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push pages${mirror ? ' (Mirror Mode)' : ''}`);

        // Validate input path structure
        this.validatePageStructure(inputPath);
        console.log(`${dryRun ? 'Would push' : 'Pushing'} local pages from "${inputPath}"`);

        // Collect all local files to upload
        const localFiles = this.collectLocalPageFiles(inputPath);

        // Get current remote pages for comparison
        const remotePages = await this.fetchPages(site, accessToken);

        // Simple approach: always sync all files for reliability
        const remotePageMap = new Map<string, Page>();
        remotePages.forEach(page => remotePageMap.set(page.handle, page));

        const toUpload: Array<{ key: string, handle: string, filePath: string }> = [];
        const toUpdate: Array<{ key: string, handle: string, filePath: string, pageId: number }> = [];
        const toDelete: Array<{ key: string, page: Page }> = [];

        // Check local files against remote
        localFiles.forEach(localFile => {
            const remotePage = remotePageMap.get(localFile.handle);
            if (!remotePage) {
                toUpload.push({ key: `${localFile.handle}.html`, ...localFile });
            } else {
                toUpdate.push({ key: `${localFile.handle}.html`, ...localFile, pageId: remotePage.id });
            }
        });

        // Check for remote pages that don't exist locally (only in mirror mode)
        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remotePages.forEach(remotePage => {
                if (!localFileMap.has(remotePage.handle)) {
                    toDelete.push({ key: `${remotePage.handle}.html`, page: remotePage });
                }
            });
        }

        console.log(`Found ${localFiles.length} local files`);
        console.log(`Pages to upload: ${toUpload.length} new, ${toUpdate.length} updated, ${localFiles.length - toUpload.length - toUpdate.length} unchanged`);
        if (mirror && toDelete.length > 0) {
            console.log(`Mirror mode: ${toDelete.length} remote pages will be deleted`);
        }

        if (dryRun) {
            dryRunManager.logDryRunSummary({ toUpload, toUpdate, toDelete });
            return;
        }

        // Upload files that need it (new files + updated files)
        const filesToUpload = [...toUpload.map(f => ({ ...f, pageId: undefined })), ...toUpdate];
        if (filesToUpload.length > 0) {
            await this.uploadPages(site, accessToken, filesToUpload);
        } else {
            console.log('No files need to be uploaded - all files are already up to date');
        }

        // Delete remote pages not present locally (only in mirror mode)
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

    private prepareOutputDirectory(outputPath: string): string {
        // Use the exact output path provided by user - no assumptions
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
        return outputPath;
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
            } catch (error: any) {
                console.warn(`Failed to delete ${file}: ${error.message}`);
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
            } catch (error: any) {
                console.warn(`Failed to download ${page.handle}: ${error.message}`);
            }
        }
    }

    private async downloadSinglePage(page: Page, outputPath: string): Promise<void> {
        const filePath = this.getPageFilePath(outputPath, page);

        // Create page content with metadata
        const pageContent = this.createPageContent(page);

        // Ensure the directory for this file exists
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, pageContent, 'utf8');
    }

    private createPageContent(page: Page): string {
        let content = `<!-- Page: ${page.title}`;
        if (page.template_suffix) {
            content += ` | Template: ${page.template_suffix}`;
        }
        content += ` -->\n\n`;

        content += page.body_html || '';

        return content;
    }

    private validatePageStructure(inputPath: string): void {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input path does not exist: ${inputPath}`);
        }

        const stat = fs.statSync(inputPath);
        if (!stat.isDirectory()) {
            throw new Error(`Input path must be a directory: ${inputPath}`);
        }
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
            } catch (error: any) {
                console.warn(`Failed to upload ${file.handle}: ${error.message}`);
            }
        }
    }

    private async uploadSinglePage(site: string, accessToken: string, file: { handle: string, filePath: string, pageId?: number }): Promise<void> {
        const content = fs.readFileSync(file.filePath, 'utf8');
        const pageData = this.parsePageContent(content, file.handle);

        const url = file.pageId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(file.pageId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        const method = file.pageId ? 'PUT' : 'POST';

        await this.makeRequest(url, method, { page: pageData }, {
            'X-Shopify-Access-Token': accessToken
        });
    }

    private parsePageContent(content: string, handle: string): Partial<Page> {
        const headerMatch = content.match(/<!-- Page: (.+?)(?: \| Template: (.+?))? -->\n\n/);
        let title = handle;
        let templateSuffix: string | undefined;

        if (headerMatch) {
            title = headerMatch[1];
            templateSuffix = headerMatch[2];
        }

        let bodyHtml = content.replace(/<!-- Page: .+? -->\n\n/, '');

        const pageData: Partial<Page> = {
            title,
            handle,
            body_html: bodyHtml
        };

        if (templateSuffix) {
            pageData.template_suffix = templateSuffix;
        }

        return pageData;
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
            } catch (error: any) {
                console.warn(`Failed to delete ${page.handle}: ${error.message}`);
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
    const credentials = pages.getCredentialsFromEnv();

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
    const credentials = pages.getCredentialsFromEnv();

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
