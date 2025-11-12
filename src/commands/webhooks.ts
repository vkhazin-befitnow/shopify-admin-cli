import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

interface Webhook {
    id: number;
    address: string;
    topic: string;
    format: string;
    fields?: string[];
    metafield_namespaces?: string[];
    private_metafield_namespaces?: string[];
}

interface WebhookMetadata {
    id: number;
    topic: string;
}

export interface WebhooksPullOptions {
    output: string;
    maxWebhooks?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface WebhooksPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyWebhooks extends BaseResourceCommand<Webhook, WebhookMetadata> {
    getResourceName(): string {
        return 'webhooks';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Webhook[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.WEBHOOKS}?limit=250`;
        return this.fetchResourcesWithPagination<Webhook>(url, site, accessToken, 'webhooks');
    }

    getResourceHandle(webhook: Webhook): string {
        return webhook.topic.replace(/\//g, '-');
    }

    extractMetadata(webhook: Webhook): WebhookMetadata {
        return {
            id: webhook.id,
            topic: webhook.topic
        };
    }

    async downloadSingleResource(webhook: Webhook, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, webhook);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const content: {
            address: string;
            topic: string;
            format: string;
            fields?: string[];
            metafield_namespaces?: string[];
            private_metafield_namespaces?: string[];
        } = {
            address: webhook.address,
            topic: webhook.topic,
            format: webhook.format
        };

        if (webhook.fields && webhook.fields.length > 0) {
            content.fields = webhook.fields;
        }

        if (webhook.metafield_namespaces && webhook.metafield_namespaces.length > 0) {
            content.metafield_namespaces = webhook.metafield_namespaces;
        }

        if (webhook.private_metafield_namespaces && webhook.private_metafield_namespaces.length > 0) {
            content.private_metafield_namespaces = webhook.private_metafield_namespaces;
        }

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<WebhookMetadata>
    ): Promise<void> {
        const contentJson = fs.readFileSync(file.filePath, 'utf8');
        const content = JSON.parse(contentJson);

        const webhookData: Partial<Webhook> = {
            address: content.address,
            topic: content.topic,
            format: content.format || 'json'
        };

        if (content.fields) {
            webhookData.fields = content.fields;
        }

        if (content.metafield_namespaces) {
            webhookData.metafield_namespaces = content.metafield_namespaces;
        }

        if (content.private_metafield_namespaces) {
            webhookData.private_metafield_namespaces = content.private_metafield_namespaces;
        }

        const webhookId = file.metadata?.id;
        const url = webhookId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.WEBHOOK_BY_ID(webhookId)}`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.WEBHOOKS}`;

        const method = webhookId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { webhook: webhookData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'webhooks'
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        webhook: Webhook
    ): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.WEBHOOK_BY_ID(webhook.id)}`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'webhooks'
        });
    }
}

export async function webhooksPullCommand(options: WebhooksPullOptions): Promise<void> {
    const webhooks = new ShopifyWebhooks();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await webhooks.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxWebhooks,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function webhooksPushCommand(options: WebhooksPushOptions): Promise<void> {
    const webhooks = new ShopifyWebhooks();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await webhooks.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
