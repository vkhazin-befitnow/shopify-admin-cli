import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

interface ProductVariant {
    id?: number;
    title: string;
    price: string;
    sku?: string;
    position?: number;
    inventory_policy?: string;
    compare_at_price?: string;
    fulfillment_service?: string;
    inventory_management?: string;
    option1?: string;
    option2?: string;
    option3?: string;
    taxable?: boolean;
    barcode?: string;
    grams?: number;
    weight?: number;
    weight_unit?: string;
    inventory_quantity?: number;
    requires_shipping?: boolean;
}

interface ProductOption {
    id?: number;
    name: string;
    position?: number;
    values: string[];
}

interface ProductImage {
    id?: number;
    position?: number;
    src: string;
    alt?: string;
}

interface Product {
    id: number;
    title: string;
    handle: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
    template_suffix?: string;
    status?: string;
    published_scope?: string;
    tags?: string;
    variants: ProductVariant[];
    options?: ProductOption[];
    images?: ProductImage[];
}

interface ProductListResult {
    products: Product[];
}

interface ProductMetadata {
    id: number;
    title: string;
    handle: string;
    vendor?: string;
    product_type?: string;
    created_at: string;
    updated_at: string;
    published_at?: string;
    template_suffix?: string;
    status?: string;
    published_scope?: string;
    tags?: string;
}

export interface ProductsPullOptions {
    output: string;
    maxProducts?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface ProductsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyProducts extends BaseResourceCommand<Product, ProductMetadata> {
    getResourceName(): string {
        return 'products';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Product[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products.json`;

        const response = await this.httpClient.request(url, 'GET', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'products',
            operationContext: 'fetch products list'
        });

        const result: ProductListResult = await response.json();
        return result.products;
    }

    getResourceHandle(product: Product): string {
        return product.handle;
    }

    extractMetadata(product: Product): ProductMetadata {
        return {
            id: product.id,
            title: product.title,
            handle: product.handle,
            vendor: product.vendor,
            product_type: product.product_type,
            created_at: product.created_at,
            updated_at: product.updated_at,
            published_at: product.published_at,
            template_suffix: product.template_suffix,
            status: product.status,
            published_scope: product.published_scope,
            tags: product.tags
        };
    }

    async downloadSingleResource(product: Product, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, product);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const productData = {
            title: product.title,
            body_html: product.body_html || '',
            vendor: product.vendor,
            product_type: product.product_type,
            tags: product.tags,
            variants: product.variants,
            options: product.options,
            images: product.images
        };

        fs.writeFileSync(filePath, JSON.stringify(productData, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<ProductMetadata>
    ): Promise<void> {
        const productJson = fs.readFileSync(file.filePath, 'utf8');
        const productData = JSON.parse(productJson);

        productData.handle = file.handle;

        if (file.metadata) {
            if (file.metadata.template_suffix !== undefined) {
                productData.template_suffix = file.metadata.template_suffix;
            }
            if (file.metadata.published_at !== undefined) {
                productData.published_at = file.metadata.published_at;
            }
            if (file.metadata.status !== undefined) {
                productData.status = file.metadata.status;
            }
            if (file.metadata.published_scope !== undefined) {
                productData.published_scope = file.metadata.published_scope;
            }
        }

        const productId = file.metadata?.id;
        const url = productId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products/${productId}.json`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products.json`;

        const method = productId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { product: productData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'products'
        });
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        product: Product
    ): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products/${product.id}.json`;

        await this.httpClient.request(url, 'DELETE', {
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'products'
        });
    }
}

export async function productsPullCommand(options: ProductsPullOptions): Promise<void> {
    const products = new ShopifyProducts();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await products.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxProducts,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function productsPushCommand(options: ProductsPushOptions): Promise<void> {
    const products = new ShopifyProducts();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await products.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}