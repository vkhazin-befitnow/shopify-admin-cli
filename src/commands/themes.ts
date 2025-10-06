import * as fs from 'fs';
import * as path from 'path';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { HttpClient } from '../utils/http-client';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

interface Theme {
    id: number;
    name: string;
    role: string;
    theme_store_id?: number;
    previewable: boolean;
    processing: boolean;
    created_at: string;
    updated_at: string;
}

interface ThemeListResult {
    themes: Theme[];
}

interface Asset {
    key: string;
    id?: number;
    public_url?: string;
    created_at: string;
    updated_at: string;
    content_type: string;
    size: number;
    checksum?: string;
    theme_id: number;
    attachment?: string;
    value?: string;
}

interface AssetListResult {
    assets: Asset[];
}

interface AssetUpload {
    key: string;
    attachment?: string;
    value?: string;
}

export interface ThemesPullOptions {
    themeName?: string;
    output: string;
    dryRun?: boolean;
    mirror?: boolean;
    published?: boolean;
    site?: string;
    accessToken?: string;
}

export interface ThemesPushOptions {
    themeName?: string;
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    published?: boolean;
    site?: string;
    accessToken?: string;
}

export class ShopifyThemes {
    private httpClient = new HttpClient();

    constructor() { }

    async pull(themeName: string | null, outputPath: string, site: string, accessToken: string, maxAssets?: number, dryRun: boolean = false, mirror: boolean = false, published: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull theme ${published ? '(published)' : `"${themeName}"`}${mirror ? ' (Mirror Mode)' : ''}`);

        // First, get all themes to find the one with matching name or published theme
        const themesList = await this.fetchThemes(site, accessToken);

        let theme: Theme | undefined;
        if (published) {
            theme = themesList.themes.find(t => t.role === 'main' || t.role === 'published');
            if (!theme) {
                throw new Error('No published theme found. Available themes: ' + themesList.themes.map(t => `"${t.name}" (role: ${t.role})`).join(', '));
            }
        } else {
            if (!themeName) {
                throw new Error('Theme name is required when --published flag is not used');
            }
            theme = themesList.themes.find(t => t.name.toLowerCase() === themeName.toLowerCase());
            if (!theme) {
                const availableThemes = themesList.themes.map(t => `"${t.name}"`).join(', ');
                throw new Error(`Theme "${themeName}" not found. Available themes: ${availableThemes}`);
            }
        }

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'themes', theme.name);
        dryRunManager.logAction('pull', `theme "${theme.name}" (ID: ${theme.id}) to: ${finalOutputPath}`);

        let assets = await this.fetchThemeAssets(site, accessToken, theme.id);

        if (maxAssets && maxAssets > 0) {
            assets = assets.slice(0, maxAssets);
            Logger.info(`Limited to first ${assets.length} assets for testing`);
        } else {
            Logger.info(`Found ${assets.length} remote assets to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remoteAssetKeys = new Set(assets.map(asset => asset.key));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteAssetKeys));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: assets.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Assets'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        // Create output directory structure only when actually downloading
        IOUtility.ensureDirectoryExists(finalOutputPath);

        if (mirror && toDelete.length > 0) {
            this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        if (assets.length > 0) {
            await this.downloadAssets(site, accessToken, theme.id, assets, finalOutputPath);
        } else {
            Logger.info('No assets to sync');
        }

        Logger.success(`Successfully pulled theme "${theme.name}" to ${finalOutputPath}`);
    }

    async push(themeName: string | null, inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false, published: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push theme ${published ? '(published)' : `"${themeName}"`}${mirror ? ' (Mirror Mode)' : ''}`);

        // First, get all themes to find the one with matching name or published theme
        const themesList = await this.fetchThemes(site, accessToken);

        let theme: Theme | undefined;
        if (published) {
            theme = themesList.themes.find(t => t.role === 'main' || t.role === 'published');
            if (!theme) {
                throw new Error('No published theme found. Available themes: ' + themesList.themes.map(t => `"${t.name}" (role: ${t.role})`).join(', '));
            }
        } else {
            if (!themeName) {
                throw new Error('Theme name is required when --published flag is not used');
            }
            theme = themesList.themes.find(t => t.name.toLowerCase() === themeName.toLowerCase());
            if (!theme) {
                const availableThemes = themesList.themes.map(t => `"${t.name}"`).join(', ');
                throw new Error(`Theme "${themeName}" not found. Available themes: ${availableThemes}`);
            }
        }

        const themeFolder = IOUtility.prepareResourcePath(inputPath, 'themes', theme.name);
        dryRunManager.logAction('push', `local theme files from "${themeFolder}" to theme "${theme.name}" (ID: ${theme.id})`);

        const localFiles = this.collectLocalThemeFiles(themeFolder);

        const remoteAssets = await this.fetchThemeAssets(site, accessToken, theme.id);

        const toDelete: Asset[] = [];

        if (mirror) {
            const localFileMap = new Map<string, { key: string, filePath: string, isImage: boolean }>();
            localFiles.forEach(file => localFileMap.set(file.key, file));

            remoteAssets.forEach(remoteAsset => {
                if (!localFileMap.has(remoteAsset.key)) {
                    toDelete.push(remoteAsset);
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote files will be deleted`);
            }
        }

        Logger.info(`Found ${localFiles.length} local files to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(asset => asset.key),
            itemType: 'Files'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        if (localFiles.length > 0) {
            await this.uploadAssets(site, accessToken, theme.id, localFiles);
        } else {
            Logger.info('No files to upload');
        }

        if (mirror && toDelete.length > 0) {
            await this.deleteAssets(site, accessToken, theme.id, toDelete);
        }

        Logger.success(`Successfully pushed theme "${theme.name}"`);
    }

    private async fetchThemes(site: string, accessToken: string): Promise<ThemeListResult> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEMES}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to fetch themes list: Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to fetch themes list: Forbidden - missing required permissions. Ensure your app has read_themes scope.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch themes list: API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            return await response.json();
        }, SHOPIFY_API.RETRY_CONFIG);
    }



    private async fetchThemeAssets(site: string, accessToken: string, themeId: number): Promise<Asset[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSETS(themeId)}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to fetch assets for theme (ID: ${themeId}): Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to fetch assets for theme (ID: ${themeId}): Forbidden - missing required permissions. Ensure your app has read_themes scope.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch assets for theme (ID: ${themeId}): API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result: AssetListResult = await response.json();
            return result.assets;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async downloadAssets(site: string, accessToken: string, themeId: number, assets: Asset[], outputPath: string): Promise<void> {
        // Ensure all necessary directories exist
        const directories = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        directories.forEach(dir => {
            IOUtility.ensureDirectoryExists(path.join(outputPath, dir));
        });

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            Logger.progress(i + 1, assets.length, `Downloading ${asset.key}`);

            try {
                const content = await RetryUtility.withRetry(
                    () => this.fetchAssetContent(site, accessToken, themeId, asset.key),
                    SHOPIFY_API.RETRY_CONFIG
                );
                const filePath = path.join(outputPath, asset.key);

                // Ensure the directory for this file exists
                IOUtility.ensureDirectoryExists(path.dirname(filePath));

                if (asset.attachment) {
                    // Binary file - decode from base64
                    const buffer = Buffer.from(asset.attachment || content, 'base64');
                    fs.writeFileSync(filePath, buffer);
                } else {
                    // Text file - write as utf8
                    fs.writeFileSync(filePath, content, 'utf8');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${asset.key}: ${message}`);
            }
        }
    }

    private async fetchAssetContent(site: string, accessToken: string, themeId: number, assetKey: string): Promise<string> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSET(themeId, assetKey)}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to download theme asset '${assetKey}': Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to download theme asset '${assetKey}': Forbidden - missing required permissions. Ensure your app has read_themes scope.`);
            }

            if (response.status === 404) {
                throw new Error(`Failed to download theme asset '${assetKey}': Asset not found in theme (ID: ${themeId}). The asset may have been deleted.`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to download theme asset '${assetKey}': API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

            const result = await response.json();
            const asset = result.asset;

            // Return the content (either attachment for binary or value for text)
            return asset.attachment || asset.value || '';
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private isValidThemeStructure(themePath: string): boolean {
        if (!fs.existsSync(themePath)) {
            return false;
        }

        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        const missingDirs = expectedDirs.filter(dir => !fs.existsSync(path.join(themePath, dir)));

        return missingDirs.length === 0;
    }

    private collectLocalThemeFiles(themeFolder: string): Array<{ key: string, filePath: string, isImage: boolean }> {
        const files: Array<{ key: string, filePath: string, isImage: boolean }> = [];

        IOUtility.walkDirectory(themeFolder, (filePath, relativePath) => {
            files.push({
                key: relativePath,
                filePath: filePath,
                isImage: IOUtility.isBinaryFile(filePath)
            });
        });

        return files;
    }

    private async uploadAssets(site: string, accessToken: string, themeId: number, files: Array<{ key: string, filePath: string, isImage: boolean }>): Promise<void> {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(i + 1, files.length, `Uploading ${file.key}`);

            try {
                await RetryUtility.withRetry(
                    () => this.uploadSingleAsset(site, accessToken, themeId, file),
                    SHOPIFY_API.RETRY_CONFIG
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to upload ${file.key}: ${message}`);
            }
        }
    }

    private async uploadSingleAsset(site: string, accessToken: string, themeId: number, file: { key: string, filePath: string, isImage: boolean }): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSETS(themeId)}`;

        const fileContent = fs.readFileSync(file.filePath);
        const asset: AssetUpload = { key: file.key };

        if (file.isImage) {
            asset.attachment = fileContent.toString('base64');
        } else {
            asset.value = fileContent.toString();
        }

        await this.httpClient.request(url, 'PUT', {
            body: { asset },
            headers: { 'X-Shopify-Access-Token': accessToken },
            resourceType: 'themes'
        });
    }



    private async deleteAssets(site: string, accessToken: string, themeId: number, assets: Asset[]): Promise<void> {
        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            Logger.progress(i + 1, assets.length, `Deleting ${asset.key}`);

            try {
                await RetryUtility.withRetry(
                    () => this.deleteSingleAsset(site, accessToken, themeId, asset),
                    SHOPIFY_API.RETRY_CONFIG
                );
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to delete ${asset.key}: ${message}`);
            }
        }
    }

    private async deleteSingleAsset(site: string, accessToken: string, themeId: number, asset: Asset): Promise<void> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSET(themeId, asset.key)}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'DELETE',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 401) {
                throw new Error(`Failed to delete theme asset '${asset.key}': Unauthorized - invalid access token or store domain. Verify your credentials.`);
            }

            if (response.status === 403) {
                throw new Error(`Failed to delete theme asset '${asset.key}': Forbidden - missing required permissions. Ensure your app has write_themes scope.`);
            }

            if (response.status === 404) {
                // Asset already doesn't exist - this is fine
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to delete theme asset '${asset.key}' from theme (ID: ${themeId}): API request failed (${response.status})${errorText ? ': ' + errorText : ''}`);
            }

        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): void {
        IOUtility.deleteLocalFiles(outputPath, filesToDelete, (file, error) => {
            Logger.warn(`Failed to delete local file ${file}: ${error}`);
        });

        filesToDelete.forEach(file => {
            Logger.info(`Deleted local file: ${file}`);
        });
    }

    private findLocalFilesToDelete(outputPath: string, remoteAssetKeys: Set<string>): string[] {
        return IOUtility.findFilesToDelete(outputPath, remoteAssetKeys, {
            recursive: true,
            includeMetaFiles: false
        });
    }
}

export async function themesPullCommand(options: ThemesPullOptions): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        const credentials = CredentialResolver.resolve(options);
        CredentialResolver.validateRequiredOptions(options, ['output']);

        await themes.pull(options.themeName || null, options.output, credentials.site, credentials.accessToken, undefined, options.dryRun || false, options.mirror || false, options.published || false);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to pull theme: ${message}`);
        process.exit(1);
    }
}

export async function themesPushCommand(options: ThemesPushOptions): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        const credentials = CredentialResolver.resolve(options);
        CredentialResolver.validateRequiredOptions(options, ['input']);

        await themes.push(options.themeName || null, options.input, credentials.site, credentials.accessToken, options.dryRun || false, options.mirror || false, options.published || false);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to push theme: ${message}`);
        process.exit(1);
    }
}
