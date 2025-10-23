import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

interface Redirect {
    id: number;
    path: string;
    target: string;
}

interface RedirectMetadata {
    id: number;
    path: string;
}

export interface RedirectsPullOptions {
    output: string;
    maxRedirects?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface RedirectsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyRedirects extends BaseResourceCommand<Redirect, RedirectMetadata> {
    getResourceName(): string {
        return 'redirects';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Redirect[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.REDIRECTS}?limit=250`;
        return this.fetchResourcesWithPagination<Redirect>(url, site, accessToken, 'redirects');
    }

    getResourceHandle(redirect: Redirect): string {
        return redirect.path.replace(/^\//, '').replace(/\//g, '-') || 'root';
    }

    extractMetadata(redirect: Redirect): RedirectMetadata {
        return {
            id: redirect.id,
            path: redirect.path
        };
    }

    async downloadSingleResource(redirect: Redirect, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, redirect);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const content = {
            target: redirect.target
        };

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<RedirectMetadata>
    ): Promise<void> {
        const contentJson = fs.readFileSync(file.filePath, 'utf8');
        const content = JSON.parse(contentJson);

        const redirectData: Partial<Redirect> = {
            target: content.target
        };

        if (file.metadata?.path) {
            redirectData.path = file.metadata.path;
        }

        const redirectId = file.metadata?.id;
        const url = redirectId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.REDIRECT_BY_ID(redirectId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.REDIRECTS}`;

        const method = redirectId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { redirect: redirectData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'redirects'
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        redirect: Redirect
    ): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.REDIRECT_BY_ID(redirect.id)}`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'redirects'
        });
    }
}

export async function redirectsPullCommand(options: RedirectsPullOptions): Promise<void> {
    const redirects = new ShopifyRedirects();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await redirects.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxRedirects,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function redirectsPushCommand(options: RedirectsPushOptions): Promise<void> {
    const redirects = new ShopifyRedirects();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await redirects.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
