import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
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

export class ShopifyPages extends BaseResourceCommand<Page, PageMetadata> {
    getResourceName(): string {
        return 'pages';
    }

    getFileExtension(): string {
        return '.html';
    }

    async fetchResources(site: string, accessToken: string): Promise<Page[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        const response = await this.httpClient.request(url, 'GET', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'pages',
            operationContext: 'fetch pages list'
        });

        const result: PageListResult = await response.json();
        return result.pages;
    }

    getResourceHandle(page: Page): string {
        return page.handle;
    }

    extractMetadata(page: Page): PageMetadata {
        return {
            id: page.id,
            title: page.title,
            handle: page.handle,
            author: page.author,
            created_at: page.created_at,
            updated_at: page.updated_at,
            published_at: page.published_at,
            template_suffix: page.template_suffix
        };
    }

    async downloadSingleResource(page: Page, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, page);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        fs.writeFileSync(filePath, page.body_html || '', 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<PageMetadata>
    ): Promise<void> {
        const bodyHtml = fs.readFileSync(file.filePath, 'utf8');

        const pageData: Partial<Page> = {
            title: file.handle,
            handle: file.handle,
            body_html: bodyHtml
        };

        if (file.metadata) {
            if (file.metadata.title) {
                pageData.title = file.metadata.title;
            }
            if (file.metadata.template_suffix !== undefined) {
                pageData.template_suffix = file.metadata.template_suffix;
            }
            if (file.metadata.published_at !== undefined) {
                pageData.published_at = file.metadata.published_at;
            }
        }

        const pageId = file.metadata?.id;
        const url = pageId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGE_BY_ID(pageId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.PAGES}`;

        const method = pageId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { page: pageData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'pages'
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        page: Page
    ): Promise<void> {
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

    await pages.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxPages,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function pagesPushCommand(options: PagesPushOptions): Promise<void> {
    const pages = new ShopifyPages();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await pages.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
