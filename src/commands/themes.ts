import * as fs from 'fs';
import * as path from 'path';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { getCredentialsFromEnv } from '../utils/auth';
import { IOUtility } from '../utils/io';

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

export class ShopifyThemes {
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
        console.log(`${dryRun ? 'Would pull' : 'Pulling'} theme "${theme.name}" (ID: ${theme.id}) to: ${finalOutputPath}`);

        let assets = await this.fetchThemeAssets(site, accessToken, theme.id);

        if (maxAssets && maxAssets > 0) {
            assets = assets.slice(0, maxAssets);
            console.log(`Limited to first ${assets.length} assets for testing`);
        } else {
            console.log(`Found ${assets.length} remote assets to sync`);
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remoteAssetKeys = new Set(assets.map(asset => asset.key));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteAssetKeys));
            
            if (toDelete.length > 0) {
                console.log(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Assets to sync: ${assets.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Local files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach((file: string) => console.log(`  - ${file}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
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
            console.log('No assets to sync');
        }

        console.log(`Successfully pulled theme "${theme.name}" to ${finalOutputPath}`);
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

        const themeFolder = this.resolveThemePath(inputPath, theme.name);
        console.log(`${dryRun ? 'Would push' : 'Pushing'} local theme files from "${themeFolder}" to theme "${theme.name}" (ID: ${theme.id})`);

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
                console.log(`Mirror mode: ${toDelete.length} remote files will be deleted`);
            }
        }

        console.log(`Found ${localFiles.length} local files to upload`);

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Files to upload: ${localFiles.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Remote files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach(asset => console.log(`  - ${asset.key}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        if (localFiles.length > 0) {
            await this.uploadAssets(site, accessToken, theme.id, localFiles);
        } else {
            console.log('No files to upload');
        }

        if (mirror && toDelete.length > 0) {
            await this.deleteAssets(site, accessToken, theme.id, toDelete);
        }

        console.log(`Successfully pushed theme "${theme.name}"`);
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
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has read_themes scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return await response.json();
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private resolveThemePath(basePath: string, themeName: string): string {
        const themePath = IOUtility.buildResourcePath(basePath, 'themes', themeName);
        
        if (!fs.existsSync(themePath)) {
            throw new Error(
                `Theme directory not found: ${themePath}\n` +
                `Expected structure: ${basePath}/themes/${themeName}/`
            );
        }

        if (!this.isValidThemeStructure(themePath)) {
            throw new Error(
                `Invalid theme structure in: ${themePath}\n` +
                `Expected Shopify theme directories: assets, config, layout, locales, sections, snippets, templates`
            );
        }

        return themePath;
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
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has read_themes scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            const result: AssetListResult = await response.json();
            return result.assets;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async downloadAssets(site: string, accessToken: string, themeId: number, assets: Asset[], outputPath: string): Promise<void> {
        // Ensure all necessary directories exist
        const directories = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        directories.forEach(dir => {
            fs.mkdirSync(path.join(outputPath, dir), { recursive: true });
        });

        const rateLimitedFetch = RetryUtility.rateLimited(
            (key: string) => this.fetchAssetContent(site, accessToken, themeId, key),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            console.log(`Downloading (${i + 1}/${assets.length}): ${asset.key}`);

            try {
                const content = await rateLimitedFetch(asset.key);
                const filePath = path.join(outputPath, asset.key);

                // Ensure the directory for this file exists
                fs.mkdirSync(path.dirname(filePath), { recursive: true });

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
                console.warn(`Failed to download ${asset.key}: ${message}`);
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
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has read_themes scope');
            }

            if (response.status === 404) {
                throw new Error(`Asset not found: ${assetKey}`);
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
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
        const rateLimitedUpload = RetryUtility.rateLimited(
            (file: { key: string, filePath: string, isImage: boolean }) => this.uploadSingleAsset(site, accessToken, themeId, file),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Uploading (${i + 1}/${files.length}): ${file.key}`);

            try {
                await rateLimitedUpload(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to upload ${file.key}: ${message}`);
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

        const response = await this.makeRequest(url, 'PUT', {
            asset
        }, {
            'X-Shopify-Access-Token': accessToken
        });

        if (response.status !== 200 && response.status !== 201) {
            throw new Error(`Failed to upload ${file.key}: ${response.status} ${response.statusText}`);
        }
    }

    private async makeRequest(url: string, method: string, body: any, headers: Record<string, string>): Promise<Response> {
        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(body)
            });

            if (response.status === 401) {
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has write_themes scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return response;
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async deleteAssets(site: string, accessToken: string, themeId: number, assets: Asset[]): Promise<void> {
        const rateLimitedDelete = RetryUtility.rateLimited(
            (asset: Asset) => this.deleteSingleAsset(site, accessToken, themeId, asset),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < assets.length; i++) {
            const asset = assets[i];
            console.log(`Deleting (${i + 1}/${assets.length}): ${asset.key}`);

            try {
                await rateLimitedDelete(asset);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete ${asset.key}: ${message}`);
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
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has write_themes scope');
            }

            if (response.status === 404) {
                // Asset already doesn't exist - this is fine
                return;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): void {
        filesToDelete.forEach(file => {
            const filePath = path.join(outputPath, file);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted local file: ${file}`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete local file ${file}: ${message}`);
            }
        });
    }

    private findLocalFilesToDelete(outputPath: string, remoteAssetKeys: Set<string>): string[] {
        const localFilesToDelete: string[] = [];

        IOUtility.walkDirectory(outputPath, (filePath, relativePath) => {
            if (!remoteAssetKeys.has(relativePath)) {
                localFilesToDelete.push(relativePath);
            }
        });

        return localFilesToDelete;
    }
}

export async function themesPullCommand(options: {
    themeName?: string;
    output: string;
    dryRun?: boolean;
    mirror?: boolean;
    published?: boolean;
    site?: string;
    accessToken?: string;
}): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        let site = options.site;
        let accessToken = options.accessToken;

        if (!site || !accessToken) {
            const envCredentials = getCredentialsFromEnv();
            if (envCredentials) {
                site = site || envCredentials.site;
                accessToken = accessToken || envCredentials.accessToken;
            }
        }

        if (!site || !accessToken) {
            throw new Error('Missing credentials. Provide either:\n' +
                '1. CLI arguments: --site <domain> --access-token <token>\n' +
                '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
        }

        await themes.pull(options.themeName || null, options.output, site, accessToken, undefined, options.dryRun || false, options.mirror || false, options.published || false);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to pull theme: ${message}`);
        process.exit(1);
    }
}

export async function themesPushCommand(options: {
    themeName?: string;
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    published?: boolean;
    site?: string;
    accessToken?: string;
}): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        let site = options.site;
        let accessToken = options.accessToken;

        if (!site || !accessToken) {
            const envCredentials = getCredentialsFromEnv();
            if (envCredentials) {
                site = site || envCredentials.site;
                accessToken = accessToken || envCredentials.accessToken;
            }
        }

        if (!site || !accessToken) {
            throw new Error('Missing credentials. Provide either:\n' +
                '1. CLI arguments: --site <domain> --access-token <token>\n' +
                '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
        }

        await themes.push(options.themeName || null, options.input, site, accessToken, options.dryRun || false, options.mirror || false, options.published || false);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to push theme: ${message}`);
        process.exit(1);
    }
}
