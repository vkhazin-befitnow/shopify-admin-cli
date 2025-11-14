import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

interface Metafield {
    id: number;
    namespace: string;
    key: string;
    value: string;
    type: string;
    description?: string;
    owner_resource: string;
    owner_id: number;
}

interface MetafieldMetadata {
    owner_resource: string;
    owner_id: number;
    id: number;
}

export interface MetafieldsPullOptions {
    output: string;
    maxMetafields?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface MetafieldsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyMetafields extends BaseResourceCommand<Metafield, MetafieldMetadata> {
    getResourceName(): string {
        return 'metafields';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Metafield[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.METAFIELDS}?limit=250`;
        return this.fetchResourcesWithPagination<Metafield>(url, site, accessToken, 'metafields');
    }

    getResourceHandle(metafield: Metafield): string {
        return `${metafield.owner_resource}_${metafield.owner_id}_${metafield.key}`;
    }

    getResourceFilePath(basePath: string, metafield: Metafield): string {
        const resourceDir = path.join(basePath, this.getResourceName());
        const ownerDir = path.join(resourceDir, metafield.owner_resource);
        const ownerIdDir = path.join(ownerDir, metafield.owner_id.toString());
        const fileName = `${metafield.key}${this.getFileExtension()}`;
        return path.join(ownerIdDir, fileName);
    }

    extractMetadata(metafield: Metafield): MetafieldMetadata {
        return {
            owner_resource: metafield.owner_resource,
            owner_id: metafield.owner_id,
            id: metafield.id
        };
    }

    async downloadSingleResource(metafield: Metafield, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, metafield);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const content: {
            namespace: string;
            key: string;
            value: string;
            type: string;
            description?: string;
        } = {
            namespace: metafield.namespace,
            key: metafield.key,
            value: metafield.value,
            type: metafield.type
        };

        if (metafield.description) {
            content.description = metafield.description;
        }

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<MetafieldMetadata>
    ): Promise<void> {
        const contentJson = fs.readFileSync(file.filePath, 'utf8');
        const content = JSON.parse(contentJson);

        const metafieldData: Partial<Metafield> = {
            namespace: content.namespace,
            key: content.key,
            value: content.value,
            type: content.type
        };

        if (content.description) {
            metafieldData.description = content.description;
        }

        if (file.metadata) {
            metafieldData.owner_resource = file.metadata.owner_resource;
            metafieldData.owner_id = file.metadata.owner_id;
        }

        const metafieldId = file.metadata?.id;
        const url = metafieldId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.METAFIELD_BY_ID(metafieldId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.METAFIELDS}`;

        const method = metafieldId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { metafield: metafieldData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'metafields'
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        metafield: Metafield
    ): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.METAFIELD_BY_ID(metafield.id)}`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'metafields'
        });
    }
}

export async function metafieldsPullCommand(options: MetafieldsPullOptions): Promise<void> {
    const metafields = new ShopifyMetafields();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await metafields.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxMetafields,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function metafieldsPushCommand(options: MetafieldsPushOptions): Promise<void> {
    const metafields = new ShopifyMetafields();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await metafields.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
