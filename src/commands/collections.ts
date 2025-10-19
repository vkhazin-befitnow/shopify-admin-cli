import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

interface CollectionRule {
    column: string;
    relation: string;
    condition: string;
}

interface Collection {
    id: number;
    title: string;
    handle: string;
    body_html?: string;
    published_at?: string;
    sort_order?: string;
    template_suffix?: string;
    published_scope?: string;
    updated_at: string;
    rules?: CollectionRule[];
    disjunctive?: boolean;
}

interface CollectionListResult {
    custom_collections?: Collection[];
    smart_collections?: Collection[];
}

interface CollectionMetadata {
    id: number;
    title: string;
    handle: string;
    collection_type: 'custom' | 'smart';
    published_at?: string;
    sort_order?: string;
    template_suffix?: string;
    published_scope?: string;
    updated_at: string;
}

export interface CollectionsPullOptions {
    output: string;
    maxCollections?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface CollectionsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyCollections extends BaseResourceCommand<Collection, CollectionMetadata> {
    getResourceName(): string {
        return 'collections';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Collection[]> {
        const allCollections: Collection[] = [];

        const customUrl = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/custom_collections.json?limit=250`;
        const customCollections = await this.fetchResourcesWithPagination<Collection>(
            customUrl,
            site,
            accessToken,
            'custom_collections'
        );

        const smartUrl = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/smart_collections.json?limit=250`;
        const smartCollections = await this.fetchResourcesWithPagination<Collection>(
            smartUrl,
            site,
            accessToken,
            'smart_collections'
        );

        allCollections.push(...customCollections.map(c => ({ ...c, collection_type: 'custom' } as any)));
        allCollections.push(...smartCollections.map(c => ({ ...c, collection_type: 'smart' } as any)));

        return allCollections;
    }

    getResourceHandle(collection: Collection): string {
        return collection.handle;
    }

    extractMetadata(collection: Collection): CollectionMetadata {
        const collectionType = (collection as any).collection_type || 'custom';
        return {
            id: collection.id,
            title: collection.title,
            handle: collection.handle,
            collection_type: collectionType,
            published_at: collection.published_at,
            sort_order: collection.sort_order,
            template_suffix: collection.template_suffix,
            published_scope: collection.published_scope,
            updated_at: collection.updated_at
        };
    }

    async downloadSingleResource(collection: Collection, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, collection);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const collectionData: any = {
            title: collection.title,
            body_html: collection.body_html || '',
            sort_order: collection.sort_order || 'alpha-asc',
            template_suffix: collection.template_suffix || null
        };

        if ((collection as any).collection_type === 'smart' && collection.rules) {
            collectionData.rules = collection.rules;
            collectionData.disjunctive = collection.disjunctive || false;
        }

        fs.writeFileSync(filePath, JSON.stringify(collectionData, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<CollectionMetadata>
    ): Promise<void> {
        if (!file.metadata) {
            throw new Error(`Missing metadata for collection ${file.handle}`);
        }

        const collectionData = JSON.parse(fs.readFileSync(file.filePath, 'utf8'));
        const isSmartCollection = file.metadata.collection_type === 'smart';
        const endpoint = isSmartCollection ? 'smart_collections' : 'custom_collections';

        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${endpoint}/${file.metadata.id}.json`;

        const payload: any = {
            [endpoint.slice(0, -1)]: {
                id: file.metadata.id,
                title: collectionData.title,
                body_html: collectionData.body_html,
                sort_order: collectionData.sort_order,
                template_suffix: collectionData.template_suffix
            }
        };

        if (isSmartCollection && collectionData.rules) {
            payload[endpoint.slice(0, -1)].rules = collectionData.rules;
            payload[endpoint.slice(0, -1)].disjunctive = collectionData.disjunctive;
        }

        await this.httpClient.request(url, 'PUT', {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            resourceType: 'collections' as any,
            operationContext: `update collection ${file.metadata.handle}`
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        resource: Collection
    ): Promise<void> {
        const isSmartCollection = (resource as any).collection_type === 'smart';
        const endpoint = isSmartCollection ? 'smart_collections' : 'custom_collections';
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${endpoint}/${resource.id}.json`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'collections' as any,
            operationContext: `delete collection ${resource.handle}`
        });
    }
}

export async function collectionsPullCommand(options: CollectionsPullOptions): Promise<void> {
    const collections = new ShopifyCollections();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await collections.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxCollections,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function collectionsPushCommand(options: CollectionsPushOptions): Promise<void> {
    const collections = new ShopifyCollections();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await collections.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
