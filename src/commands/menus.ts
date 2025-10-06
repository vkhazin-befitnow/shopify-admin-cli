import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

interface MenuLink {
    id: string;
    title: string;
    url: string;
    type: string;
}

interface Menu {
    id: string;
    title: string;
    handle: string;
    items: MenuLink[];
}

interface MenuMetadata {
    id: string;
    title: string;
    handle: string;
}

export interface MenusPullOptions {
    output: string;
    maxMenus?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface MenusPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyMenus {
    private static readonly JSON_EXTENSION = '.json';
    private static readonly META_EXTENSION = '.meta';

    async pull(outputPath: string, site: string, accessToken: string, maxMenus?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull menus${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'menus');
        dryRunManager.logAction('pull', `menus to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        let menus = await this.fetchMenus(site, accessToken);

        if (maxMenus && maxMenus > 0) {
            menus = menus.slice(0, maxMenus);
            Logger.info(`Limited to first ${menus.length} menus for testing`);
        } else {
            Logger.info(`Found ${menus.length} remote menus to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remoteMenuHandles = new Set(menus.map(menu => `${menu.handle}${ShopifyMenus.JSON_EXTENSION}`));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteMenuHandles));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: menus.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Menus'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };
        if (menus.length > 0) {
            Object.assign(downloadResult, await this.downloadMenus(menus, finalOutputPath));
        } else {
            Logger.info('No menus to sync');
        }

        const summary = [`Successfully pulled menus to ${finalOutputPath}`];
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
        dryRunManager.logDryRunHeader(`Push menus${mirror ? ' (Mirror Mode)' : ''}`);

        const menusPath = IOUtility.prepareResourcePath(inputPath, 'menus');
        dryRunManager.logAction('push', `local menus from "${menusPath}"`);

        const localFiles = this.collectLocalMenuFiles(menusPath);

        const remoteMenus = await this.fetchMenus(site, accessToken);

        const toDelete: Array<{ key: string, menu: Menu }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remoteMenus.forEach(remoteMenu => {
                if (!localFileMap.has(remoteMenu.handle)) {
                    toDelete.push({ key: `${remoteMenu.handle}${ShopifyMenus.JSON_EXTENSION}`, menu: remoteMenu });
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote menus will be deleted`);
            }
        }

        if (localFiles.length === 0 && !mirror) {
            throw new Error(`No local menu files found to upload. Use --mirror flag if you want to delete all remote menus.`);
        }

        Logger.info(`Found ${localFiles.length} local menus to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(item => item.key),
            itemType: 'Menus'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };
        if (localFiles.length > 0) {
            Object.assign(uploadResult, await this.uploadMenus(site, accessToken, localFiles));

            // Fail immediately if any uploads failed
            if (uploadResult.failed > 0) {
                Logger.error(`\nUpload failures encountered:`);
                uploadResult.errors.forEach(error => Logger.error(`  - ${error}`));
                throw new Error(`Push failed: ${uploadResult.failed} menu(s) failed to upload. See above for details.`);
            }
        } else {
            Logger.info('No menus to upload');
        }

        const deleteResult = { deleted: 0, failed: 0, errors: [] as string[] };
        if (mirror && toDelete.length > 0) {
            Object.assign(deleteResult, await this.deleteMenus(site, accessToken, toDelete.map(item => item.menu)));

            // Fail immediately if any deletions failed
            if (deleteResult.failed > 0) {
                Logger.error(`\nDeletion failures encountered:`);
                deleteResult.errors.forEach(error => Logger.error(`  - ${error}`));
                throw new Error(`Push failed: ${deleteResult.failed} menu(s) failed to delete. See above for details.`);
            }
        }

        // Only log success if everything actually succeeded
        const summary = ['Successfully pushed menus'];
        if (uploadResult.uploaded > 0) {
            summary.push(`Uploaded: ${uploadResult.uploaded}`);
        }
        if (deleteResult.deleted > 0) {
            summary.push(`Deleted: ${deleteResult.deleted}`);
        }

        Logger.success(summary.join(' | '));
    }

    private async fetchMenus(site: string, accessToken: string): Promise<Menu[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`;

        const query = `
            query {
                menus(first: 250) {
                    edges {
                        node {
                            id
                            title
                            handle
                            items {
                                id
                                title
                                url
                                type
                            }
                        }
                    }
                }
            }
        `;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });

            if (response.status === 401) {
                throw new Error(`Failed to fetch menus list: Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to fetch menus list: Forbidden - missing required permissions. Ensure your app has read_online_store_navigation scope.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch menus list: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            return result.data.menus.edges.map((edge: any) => edge.node);
        }, SHOPIFY_API.RETRY_CONFIG);
    }


    private getMenuFilePath(outputPath: string, menu: Menu): string {
        return path.join(outputPath, `${menu.handle}${ShopifyMenus.JSON_EXTENSION}`);
    }

    private findLocalFilesToDelete(outputPath: string, remoteMenuHandles: Set<string>): string[] {
        return IOUtility.findFilesToDelete(outputPath, remoteMenuHandles, {
            fileExtension: ShopifyMenus.JSON_EXTENSION
        });
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
        const deletedCount = IOUtility.deleteLocalFiles(outputPath, filesToDelete, (file, error) => {
            Logger.error(`Failed to delete ${file}: ${error}`);
        });

        filesToDelete.forEach(file => {
            Logger.info(`Deleted local file: ${file}`);
        });

        return deletedCount;
    }

    private async downloadMenus(menus: Menu[], outputPath: string): Promise<{ downloaded: number, failed: number, errors: string[] }> {
        const result = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < menus.length; i++) {
            const menu = menus[i];
            Logger.progress(i + 1, menus.length, `Downloading ${menu.handle}${ShopifyMenus.JSON_EXTENSION}`);

            try {
                // RetryUtility.withRetry now handles both retry logic AND rate limiting automatically
                await RetryUtility.withRetry(
                    () => this.downloadSingleMenu(menu, outputPath),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.downloaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${menu.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${menu.handle}: ${message}`);
            }
        }

        return result;
    }

    private async downloadSingleMenu(menu: Menu, outputPath: string): Promise<void> {
        const filePath = this.getMenuFilePath(outputPath, menu);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        fs.writeFileSync(filePath, JSON.stringify(menu.items, null, 2), 'utf8');

        const metadata: MenuMetadata = {
            id: menu.id,
            title: menu.title,
            handle: menu.handle
        };
        const metaPath = `${filePath}${ShopifyMenus.META_EXTENSION}`;
        fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
    }



    private collectLocalMenuFiles(inputPath: string): Array<{ handle: string, filePath: string, menuId?: string }> {
        const files: Array<{ handle: string, filePath: string, menuId?: string }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && entry.name.endsWith(ShopifyMenus.JSON_EXTENSION)) {
                const handle = entry.name.replace(ShopifyMenus.JSON_EXTENSION, '');
                const filePath = path.join(inputPath, entry.name);
                const metaPath = `${filePath}${ShopifyMenus.META_EXTENSION}`;

                let menuId: string | undefined;
                if (fs.existsSync(metaPath)) {
                    try {
                        const metaContent = fs.readFileSync(metaPath, 'utf8');
                        const metadata = yaml.load(metaContent) as MenuMetadata;
                        menuId = metadata.id;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        Logger.warn(`Failed to read metadata for ${entry.name}: ${message}`);
                    }
                }

                files.push({ handle, filePath, menuId });
            }
        });

        return files;
    }

    private async uploadMenus(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, menuId?: string }>): Promise<{ uploaded: number, failed: number, errors: string[] }> {
        const result = { uploaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(i + 1, files.length, `Uploading ${file.handle}${ShopifyMenus.JSON_EXTENSION}`);

            try {
                // RetryUtility.withRetry now handles both retry logic AND rate limiting automatically
                await RetryUtility.withRetry(
                    () => this.uploadSingleMenu(site, accessToken, file),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.uploaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.error(`Failed to upload ${file.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${file.handle}: ${message}`);
            }
        }

        return result;
    }

    private async uploadSingleMenu(site: string, accessToken: string, file: { handle: string, filePath: string, menuId?: string }): Promise<void> {
        const linksJson = fs.readFileSync(file.filePath, 'utf8');
        const links = JSON.parse(linksJson) as MenuLink[];

        let title = file.handle;
        const metaPath = `${file.filePath}${ShopifyMenus.META_EXTENSION}`;
        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metadata = yaml.load(metaContent) as MenuMetadata;
                if (metadata.title) {
                    title = metadata.title;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to read metadata for ${file.handle}, using defaults: ${message}`);
            }
        }

        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`;

        if (file.menuId) {
            await this.updateMenu(url, accessToken, file.menuId, title, links);
        } else {
            await this.createMenu(url, accessToken, title, file.handle, links);
        }
    }

    private async updateMenu(url: string, accessToken: string, menuId: string, title: string, items: MenuLink[]): Promise<void> {
        const itemsInput = items.map(item => `{
            title: ${JSON.stringify(item.title)},
            url: ${JSON.stringify(item.url)},
            type: ${item.type}
        }`).join(',');

        const mutation = `
            mutation {
                menuUpdate(id: ${JSON.stringify(menuId)}, title: ${JSON.stringify(title)}, items: [${itemsInput}]) {
                    menu {
                        id
                        title
                        handle
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: mutation })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to update menu: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            if (result.data.menuUpdate.userErrors && result.data.menuUpdate.userErrors.length > 0) {
                throw new Error(`User errors: ${JSON.stringify(result.data.menuUpdate.userErrors)}`);
            }
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async createMenu(url: string, accessToken: string, title: string, handle: string, items: MenuLink[]): Promise<void> {
        const itemsInput = items.map(item => `{
            title: ${JSON.stringify(item.title)},
            url: ${JSON.stringify(item.url)},
            type: ${item.type}
        }`).join(',');

        const mutation = `
            mutation {
                menuCreate(title: ${JSON.stringify(title)}, handle: ${JSON.stringify(handle)}, items: [${itemsInput}]) {
                    menu {
                        id
                        title
                        handle
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: mutation })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to create menu: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            if (result.data.menuCreate.userErrors && result.data.menuCreate.userErrors.length > 0) {
                throw new Error(`User errors: ${JSON.stringify(result.data.menuCreate.userErrors)}`);
            }
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async deleteMenus(site: string, accessToken: string, menus: Menu[]): Promise<{ deleted: number, failed: number, errors: string[] }> {
        const result = { deleted: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < menus.length; i++) {
            const menu = menus[i];
            Logger.progress(i + 1, menus.length, `Deleting ${menu.handle}`);

            try {
                // RetryUtility.withRetry now handles both retry logic AND rate limiting automatically
                await RetryUtility.withRetry(
                    () => this.deleteSingleMenu(site, accessToken, menu),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.deleted++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.error(`Failed to delete ${menu.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${menu.handle}: ${message}`);
            }
        }

        return result;
    }

    private async deleteSingleMenu(site: string, accessToken: string, menu: Menu): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`;

        const mutation = `
            mutation {
                menuDelete(id: ${JSON.stringify(menu.id)}) {
                    deletedMenuId
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query: mutation })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete menu: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
            }

            if (result.data.menuDelete.userErrors && result.data.menuDelete.userErrors.length > 0) {
                throw new Error(`User errors: ${JSON.stringify(result.data.menuDelete.userErrors)}`);
            }
        }, SHOPIFY_API.RETRY_CONFIG);
    }


}

export async function menusPullCommand(options: MenusPullOptions): Promise<void> {
    const menus = new ShopifyMenus();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await menus.pull(
        options.output,
        credentials.site,
        credentials.accessToken,
        options.maxMenus,
        options.dryRun,
        options.mirror
    );
}

export async function menusPushCommand(options: MenusPushOptions): Promise<void> {
    const menus = new ShopifyMenus();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await menus.push(
        options.input,
        credentials.site,
        credentials.accessToken,
        options.dryRun,
        options.mirror
    );
}
