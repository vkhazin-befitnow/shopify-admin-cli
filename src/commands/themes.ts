import * as fs from 'fs';
import * as path from 'path';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';

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

    getCredentialsFromEnv(): { site: string; accessToken: string } | null {
        const site = process.env.SHOPIFY_STORE_DOMAIN;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (site && accessToken) {
            return { site, accessToken };
        }

        return null;
    }

    async pull(themeName: string, outputPath: string, site: string, accessToken: string, maxAssets?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull theme "${themeName}"${mirror ? ' (Mirror Mode)' : ''}`);

        // First, get all themes to find the one with matching name
        const themesList = await this.fetchThemes(site, accessToken);
        const theme = themesList.themes.find(t => t.name.toLowerCase() === themeName.toLowerCase());

        if (!theme) {
            const availableThemes = themesList.themes.map(t => `"${t.name}"`).join(', ');
            throw new Error(`Theme "${themeName}" not found. Available themes: ${availableThemes}`);
        }

        const finalOutputPath = this.prepareOutputDirectory(outputPath, theme.name);
        console.log(`${dryRun ? 'Would pull' : 'Pulling'} theme "${theme.name}" (ID: ${theme.id}) to: ${finalOutputPath}`);

        let assets = await this.fetchThemeAssets(site, accessToken, theme.id);

        if (maxAssets && maxAssets > 0) {
            assets = assets.slice(0, maxAssets);
            console.log(`Limited to first ${assets.length} assets for testing`);
        } else {
            console.log(`Found ${assets.length} remote assets`);
        }

        // Simple approach: always sync all files for reliability
        const toDownload: Asset[] = [];
        const toUpdate: Asset[] = [];
        const toDelete: string[] = [];

        // Check each asset
        assets.forEach(asset => {
            const localFilePath = path.join(finalOutputPath, asset.key);
            if (!fs.existsSync(localFilePath)) {
                toDownload.push(asset);
            } else {
                toUpdate.push(asset);
            }
        });

        // Find local files to delete (only in mirror mode)
        if (mirror) {
            const remoteAssetKeys = new Set(assets.map(asset => asset.key));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteAssetKeys));
        }

        console.log(`Assets to download: ${toDownload.length} new, ${toUpdate.length} updated, ${assets.length - toDownload.length - toUpdate.length} unchanged`);
        if (mirror && toDelete.length > 0) {
            console.log(`Mirror mode: ${toDelete.length} local files will be deleted`);
        }

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Assets to download (new): ${toDownload.length}`);
            console.log(`Assets to update (modified): ${toUpdate.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Local files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach((file: string) => console.log(`  - ${file}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        // Delete local files not present remotely (only in mirror mode)
        if (mirror && toDelete.length > 0) {
            this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        // Download files that need it (new assets + updated assets)
        const assetsToDownload = [...toDownload, ...toUpdate];
        if (assetsToDownload.length > 0) {
            await this.downloadAssets(site, accessToken, theme.id, assetsToDownload, finalOutputPath);
        } else {
            console.log('No assets need to be downloaded - all files are already up to date');
        }

        console.log(`Successfully pulled theme "${theme.name}" to ${finalOutputPath}`);
    }

    async push(themeName: string, inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push theme "${themeName}"${mirror ? ' (Mirror Mode)' : ''}`);

        // First, get all themes to find the one with matching name
        const themesList = await this.fetchThemes(site, accessToken);
        const theme = themesList.themes.find(t => t.name.toLowerCase() === themeName.toLowerCase());

        if (!theme) {
            const availableThemes = themesList.themes.map(t => `"${t.name}"`).join(', ');
            throw new Error(`Theme "${themeName}" not found. Available themes: ${availableThemes}`);
        }

        // Validate input path structure
        const themeFolder = this.validateThemeStructure(inputPath, themeName);
        console.log(`${dryRun ? 'Would push' : 'Pushing'} local theme files from "${themeFolder}" to theme "${theme.name}" (ID: ${theme.id})`);

        // Collect all local files to upload
        const localFiles = this.collectLocalThemeFiles(themeFolder);

        // Get current remote assets for comparison
        const remoteAssets = await this.fetchThemeAssets(site, accessToken, theme.id);

        // Simple approach: always sync all files for reliability
        const remoteAssetMap = new Map<string, Asset>();
        remoteAssets.forEach(asset => remoteAssetMap.set(asset.key, asset));

        const toUpload: Array<{ key: string, filePath: string, isImage: boolean }> = [];
        const toUpdate: Array<{ key: string, filePath: string, isImage: boolean }> = [];
        const toDelete: Asset[] = [];

        // Check local files against remote
        localFiles.forEach(localFile => {
            const remoteAsset = remoteAssetMap.get(localFile.key);
            if (!remoteAsset) {
                toUpload.push(localFile);
            } else {
                toUpdate.push(localFile);
            }
        });

        // Check for remote files that don't exist locally (only in mirror mode)
        if (mirror) {
            const localFileMap = new Map<string, { key: string, filePath: string, isImage: boolean }>();
            localFiles.forEach(file => localFileMap.set(file.key, file));

            remoteAssets.forEach(remoteAsset => {
                if (!localFileMap.has(remoteAsset.key)) {
                    toDelete.push(remoteAsset);
                }
            });
        }

        console.log(`Found ${localFiles.length} local files`);
        console.log(`Files to upload: ${toUpload.length} new, ${toUpdate.length} updated, ${localFiles.length - toUpload.length - toUpdate.length} unchanged`);
        if (mirror && toDelete.length > 0) {
            console.log(`Mirror mode: ${toDelete.length} remote files will be deleted`);
        }

        if (dryRun) {
            dryRunManager.logDryRunSummary({ toUpload, toUpdate, toDelete });
            return;
        }

        // Upload files that need it (new files + updated files)
        const filesToUpload = [...toUpload, ...toUpdate];
        if (filesToUpload.length > 0) {
            await this.uploadAssets(site, accessToken, theme.id, filesToUpload);
        } else {
            console.log('No files need to be uploaded - all files are already up to date');
        }

        // Delete remote files not present locally (only in mirror mode)
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

    private prepareOutputDirectory(outputPath: string, themeName: string): string {
        // Use the exact output path provided by user - no assumptions
        fs.mkdirSync(outputPath, { recursive: true });
        return outputPath;
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

                // Note: We don't need to set timestamps anymore since we always sync everything

            } catch (error: any) {
                console.warn(`Failed to download ${asset.key}: ${error.message}`);
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

    private validateThemeStructure(inputPath: string, themeName: string): string {
        // Input path should point directly to a theme folder
        if (!fs.existsSync(inputPath)) {
            throw new Error(`Input path does not exist: ${inputPath}`);
        }

        // Validate that it has expected Shopify theme structure
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        const missingDirs = expectedDirs.filter(dir => !fs.existsSync(path.join(inputPath, dir)));

        if (missingDirs.length > 0) {
            throw new Error(`Input path is not a valid Shopify theme. Missing directories: ${missingDirs.join(', ')}`);
        }

        return inputPath;
    }

    private collectLocalThemeFiles(themeFolder: string): Array<{ key: string, filePath: string, isImage: boolean }> {
        const files: Array<{ key: string, filePath: string, isImage: boolean }> = [];

        // Recursively find all files in the theme folder
        const walkDir = (dir: string, baseDir: string) => {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    walkDir(itemPath, baseDir);
                } else if (stat.isFile()) {
                    const relativePath = path.relative(baseDir, itemPath);
                    const key = relativePath.replace(/\\/g, '/'); // Normalize path separators
                    const isImage = this.isImageFile(itemPath);

                    files.push({
                        key: key,
                        filePath: itemPath,
                        isImage
                    });
                }
            });
        };

        walkDir(themeFolder, themeFolder);
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
            } catch (error: any) {
                console.warn(`Failed to upload ${file.key}: ${error.message}`);
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
            } catch (error: any) {
                console.warn(`Failed to delete ${asset.key}: ${error.message}`);
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
            } catch (error: any) {
                console.warn(`Failed to delete local file ${file}: ${error.message}`);
            }
        });

        // Clean up empty directories
        this.cleanupEmptyDirectories(outputPath);
    }

    private cleanupEmptyDirectories(outputPath: string): void {
        const walkDir = (dir: string) => {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    walkDir(itemPath);

                    // Check if directory is empty after cleanup
                    try {
                        const remainingItems = fs.readdirSync(itemPath);
                        if (remainingItems.length === 0 && itemPath !== outputPath) {
                            fs.rmdirSync(itemPath);
                            console.log(`Removed empty directory: ${path.relative(outputPath, itemPath)}`);
                        }
                    } catch (error) {
                        // Directory might not be empty or might not exist
                    }
                }
            });
        };

        walkDir(outputPath);
    }

    /**
     * Check if a file is a binary/image file based on extension
     */
    private isImageFile(filePath: string): boolean {
        const binaryExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
            '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip',
            '.mp4', '.webm', '.mp3', '.wav', '.webp'
        ];
        const ext = path.extname(filePath).toLowerCase();
        return binaryExtensions.includes(ext);
    }

    /**
     * Find local files that should be deleted (not present in remote assets)
     */
    private findLocalFilesToDelete(outputPath: string, remoteAssetKeys: Set<string>): string[] {
        const localFilesToDelete: string[] = [];

        const walkDir = (dir: string, baseDir: string) => {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    walkDir(itemPath, baseDir);
                } else if (stat.isFile()) {
                    const relativePath = path.relative(baseDir, itemPath);
                    const key = relativePath.replace(/\\/g, '/'); // Normalize path separators

                    if (!remoteAssetKeys.has(key)) {
                        localFilesToDelete.push(key);
                    }
                }
            });
        };

        walkDir(outputPath, outputPath);
        return localFilesToDelete;
    }
}

export async function themesPullCommand(options: {
    themeName: string;
    output: string;
    dryRun?: boolean;
    mirror?: boolean;
    site?: string;
    accessToken?: string;
}): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        let site = options.site;
        let accessToken = options.accessToken;

        if (!site || !accessToken) {
            const envCredentials = themes.getCredentialsFromEnv();
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

        await themes.pull(options.themeName, options.output, site, accessToken, undefined, options.dryRun || false, options.mirror || false);

    } catch (error: any) {
        console.error(`Failed to pull theme: ${error.message}`);
        process.exit(1);
    }
}

export async function themesPushCommand(options: {
    themeName: string;
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site?: string;
    accessToken?: string;
}): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        let site = options.site;
        let accessToken = options.accessToken;

        if (!site || !accessToken) {
            const envCredentials = themes.getCredentialsFromEnv();
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

        await themes.push(options.themeName, options.input, site, accessToken, options.dryRun || false, options.mirror || false);

    } catch (error: any) {
        console.error(`Failed to push theme: ${error.message}`);
        process.exit(1);
    }
}
