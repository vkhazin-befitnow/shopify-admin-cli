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

export class ShopifyProducts {
    private static readonly JSON_EXTENSION = '.json';
    private static readonly META_EXTENSION = '.meta';

    private httpClient = new HttpClient();

    async pull(outputPath: string, site: string, accessToken: string, maxProducts?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull products${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'products');
        dryRunManager.logAction('pull', `products to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        let products = await this.fetchProducts(site, accessToken);

        if (maxProducts && maxProducts > 0) {
            products = products.slice(0, maxProducts);
            Logger.info(`Limited to first ${products.length} products for testing`);
        } else {
            Logger.info(`Found ${products.length} remote products to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remoteProductHandles = new Set(products.map(product => `${product.handle}${ShopifyProducts.JSON_EXTENSION}`));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteProductHandles));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: products.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Products'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };
        if (products.length > 0) {
            Object.assign(downloadResult, await this.downloadProducts(products, finalOutputPath));
        } else {
            Logger.info('No products to sync');
        }

        const summary = [`Successfully pulled products to ${finalOutputPath}`];
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
        dryRunManager.logDryRunHeader(`Push products${mirror ? ' (Mirror Mode)' : ''}`);

        const productsPath = IOUtility.prepareResourcePath(inputPath, 'products');
        dryRunManager.logAction('push', `local products from "${productsPath}"`);

        const localFiles = this.collectLocalProductFiles(productsPath);

        const remoteProducts = await this.fetchProducts(site, accessToken);

        const toDelete: Array<{ key: string, product: Product }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remoteProducts.forEach(remoteProduct => {
                if (!localFileMap.has(remoteProduct.handle)) {
                    toDelete.push({ key: `${remoteProduct.handle}${ShopifyProducts.JSON_EXTENSION}`, product: remoteProduct });
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote products will be deleted`);
            }
        }

        Logger.info(`Found ${localFiles.length} local products to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(item => item.key),
            itemType: 'Products'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };
        if (localFiles.length > 0) {
            Object.assign(uploadResult, await this.uploadProducts(site, accessToken, localFiles));
        } else {
            Logger.info('No products to upload');
        }

        const deleteResult = { deleted: 0, failed: 0, errors: [] as string[] };
        if (mirror && toDelete.length > 0) {
            Object.assign(deleteResult, await this.deleteProducts(site, accessToken, toDelete.map(item => item.product)));
        }

        const summary = ['Successfully pushed products'];
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

    private async fetchProducts(site: string, accessToken: string): Promise<Product[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products.json`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to fetch products list: Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to fetch products list: Forbidden - missing required permissions. Ensure your app has read_products scope.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch products list: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result: ProductListResult = await response.json();
            return result.products;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private getProductFilePath(outputPath: string, product: Product): string {
        return path.join(outputPath, `${product.handle}${ShopifyProducts.JSON_EXTENSION}`);
    }

    private findLocalFilesToDelete(outputPath: string, remoteProductHandles: Set<string>): string[] {
        return IOUtility.findFilesToDelete(outputPath, remoteProductHandles, {
            fileExtension: ShopifyProducts.JSON_EXTENSION
        });
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
        const deletedCount = IOUtility.deleteLocalFiles(outputPath, filesToDelete, (file, error) => {
            Logger.warn(`Failed to delete ${file}: ${error}`);
        });

        filesToDelete.forEach(file => {
            Logger.info(`Deleted local file: ${file}`);
        });

        return deletedCount;
    }

    private async downloadProducts(products: Product[], outputPath: string): Promise<{ downloaded: number, failed: number, errors: string[] }> {
        const result = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            Logger.progress(i + 1, products.length, `Downloading ${product.handle}${ShopifyProducts.JSON_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.downloadSingleProduct(product, outputPath),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.downloaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${product.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${product.handle}: ${message}`);
            }
        }

        return result;
    }

    private async downloadSingleProduct(product: Product, outputPath: string): Promise<void> {
        const filePath = this.getProductFilePath(outputPath, product);

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

        const metadata: ProductMetadata = {
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
        const metaPath = `${filePath}${ShopifyProducts.META_EXTENSION}`;
        fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
    }

    private collectLocalProductFiles(inputPath: string): Array<{ handle: string, filePath: string, productId?: number }> {
        const files: Array<{ handle: string, filePath: string, productId?: number }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && entry.name.endsWith(ShopifyProducts.JSON_EXTENSION)) {
                const handle = entry.name.replace(ShopifyProducts.JSON_EXTENSION, '');
                const filePath = path.join(inputPath, entry.name);
                const metaPath = `${filePath}${ShopifyProducts.META_EXTENSION}`;

                let productId: number | undefined;
                if (fs.existsSync(metaPath)) {
                    try {
                        const metaContent = fs.readFileSync(metaPath, 'utf8');
                        const metadata = yaml.load(metaContent) as ProductMetadata;
                        productId = metadata.id;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        Logger.warn(`Failed to read metadata for ${entry.name}: ${message}`);
                    }
                }

                files.push({ handle, filePath, productId });
            }
        });

        return files;
    }

    private async uploadProducts(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, productId?: number }>): Promise<{ uploaded: number, failed: number, errors: string[] }> {
        const result = { uploaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(i + 1, files.length, `Uploading ${file.handle}${ShopifyProducts.JSON_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.uploadSingleProduct(site, accessToken, file),
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

    private async uploadSingleProduct(site: string, accessToken: string, file: { handle: string, filePath: string, productId?: number }): Promise<void> {
        const productJson = fs.readFileSync(file.filePath, 'utf8');
        const productData = JSON.parse(productJson);

        productData.handle = file.handle;

        const metaPath = `${file.filePath}${ShopifyProducts.META_EXTENSION}`;
        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metadata = yaml.load(metaContent) as ProductMetadata;

                if (metadata.template_suffix !== undefined) {
                    productData.template_suffix = metadata.template_suffix;
                }
                if (metadata.published_at !== undefined) {
                    productData.published_at = metadata.published_at;
                }
                if (metadata.status !== undefined) {
                    productData.status = metadata.status;
                }
                if (metadata.published_scope !== undefined) {
                    productData.published_scope = metadata.published_scope;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to read metadata for ${file.handle}, using defaults: ${message}`);
            }
        }

        const url = file.productId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products/${file.productId}.json`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/products.json`;

        const method = file.productId ? 'PUT' : 'POST';

        await this.httpClient.request(url, method, {
            body: { product: productData },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'products'
        });
    }

    private async deleteProducts(site: string, accessToken: string, products: Product[]): Promise<{ deleted: number, failed: number, errors: string[] }> {
        const result = { deleted: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            Logger.progress(i + 1, products.length, `Deleting ${product.handle}`);

            try {
                await RetryUtility.withRetry(
                    () => this.deleteSingleProduct(site, accessToken, product),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.deleted++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to delete ${product.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${product.handle}: ${message}`);
            }
        }

        return result;
    }

    private async deleteSingleProduct(site: string, accessToken: string, product: Product): Promise<void> {
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

    await products.pull(
        options.output,
        credentials.site,
        credentials.accessToken,
        options.maxProducts,
        options.dryRun,
        options.mirror
    );
}

export async function productsPushCommand(options: ProductsPushOptions): Promise<void> {
    const products = new ShopifyProducts();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await products.push(
        options.input,
        credentials.site,
        credentials.accessToken,
        options.dryRun,
        options.mirror
    );
}
