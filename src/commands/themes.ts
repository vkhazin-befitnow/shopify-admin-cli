import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
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

export class ShopifyThemes {
    constructor() { }

    async list(options?: {
        site?: string;
        accessToken?: string;
    }): Promise<ThemeListResult> {
        let site = options?.site;
        let accessToken = options?.accessToken;

        if (!site || !accessToken) {
            const envCredentials = this.getCredentialsFromEnv();
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

        return await this.fetchThemes(site, accessToken);
    }

    getCredentialsFromEnv(): { site: string; accessToken: string } | null {
        const site = process.env.SHOPIFY_STORE_DOMAIN;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (site && accessToken) {
            return { site, accessToken };
        }

        return null;
    }

    async pull(themeName: string, outputPath: string, site: string, accessToken: string, maxAssets?: number): Promise<void> {
        // First, get all themes to find the one with matching name
        const themesList = await this.fetchThemes(site, accessToken);
        const theme = themesList.themes.find(t => t.name.toLowerCase() === themeName.toLowerCase());

        if (!theme) {
            const availableThemes = themesList.themes.map(t => `"${t.name}"`).join(', ');
            throw new Error(`Theme "${themeName}" not found. Available themes: ${availableThemes}`);
        }

        const finalOutputPath = this.prepareOutputDirectory(outputPath, theme.name);
        console.log(`Pulling theme "${theme.name}" (ID: ${theme.id}) to: ${finalOutputPath}`);

        let assets = await this.fetchThemeAssets(site, accessToken, theme.id);

        if (maxAssets && maxAssets > 0) {
            assets = assets.slice(0, maxAssets);
            console.log(`Limited to first ${assets.length} assets for testing`);
        } else {
            console.log(`Found ${assets.length} assets to download`);
        }

        await this.downloadAssets(site, accessToken, theme.id, assets, finalOutputPath);

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

        // Analyze what changes would be made
        const changes = this.analyzeChanges(localFiles, remoteAssets, mirror);

        console.log(`Found ${localFiles.length} local files`);
        if (mirror && changes.toDelete.length > 0) {
            console.log(`Mirror mode: ${changes.toDelete.length} remote files will be deleted`);
        }

        if (dryRun) {
            dryRunManager.logDryRunSummary(changes);
            return;
        }

        // Upload all files if not in dry-run mode
        await this.uploadAssets(site, accessToken, theme.id, localFiles);

        // Delete remote files not present locally (only in mirror mode)
        if (mirror && changes.toDelete.length > 0) {
            await this.deleteAssets(site, accessToken, theme.id, changes.toDelete);
        }

        console.log(`Successfully pushed theme "${theme.name}"`);
    }

    private async fetchThemes(site: string, accessToken: string): Promise<ThemeListResult> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEMES}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'GET',
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
                throw new Error(`API request failed: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();

            if (!data.themes || !Array.isArray(data.themes)) {
                throw new Error('Invalid response: missing themes data');
            }

            return { themes: data.themes };

        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private prepareOutputDirectory(outputPath: string, themeName: string): string {
        let finalPath = outputPath;

        if (!outputPath.endsWith('themes')) {
            finalPath = path.join(outputPath, 'themes');
        }

        const themeFolder = themeName.replace(/[^a-zA-Z0-9\-_]/g, '_');
        finalPath = path.join(finalPath, themeFolder);

        fs.mkdirSync(finalPath, { recursive: true });

        return finalPath;
    }

    private async fetchThemeAssets(site: string, accessToken: string, themeId: number): Promise<Asset[]> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSETS(themeId)}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'GET',
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
                throw new Error(`API request failed: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();
            return data.assets || [];

        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private async downloadAssets(site: string, accessToken: string, themeId: number, assets: Asset[], outputPath: string): Promise<void> {
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

                const dir = path.dirname(filePath);
                fs.mkdirSync(dir, { recursive: true });

                if (asset.attachment) {
                    fs.writeFileSync(filePath, Buffer.from(asset.attachment, 'base64'));
                } else if (content) {
                    fs.writeFileSync(filePath, content, 'utf8');
                }

            } catch (error: any) {
                console.warn(`Failed to download ${asset.key}: ${error.message}`);
            }
        }
    }

    private async fetchAssetContent(site: string, accessToken: string, themeId: number, assetKey: string): Promise<string> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.THEME_ASSET(themeId, assetKey)}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status} ${await response.text()}`);
            }

            const data = await response.json();
            const asset = data.asset;

            return asset.value || asset.attachment || '';

        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private validateThemeStructure(inputPath: string, themeName: string): string {
        let themeFolder = inputPath;

        // If inputPath contains a themes folder, look for the theme inside it
        if (inputPath.includes('/themes/')) {
            themeFolder = path.join(inputPath, themeName);
        } else if (fs.existsSync(path.join(inputPath, 'themes', themeName))) {
            themeFolder = path.join(inputPath, 'themes', themeName);
        }

        if (!fs.existsSync(themeFolder)) {
            throw new Error(`Theme folder not found: ${themeFolder}`);
        }

        // Validate that it has expected Shopify theme structure
        const expectedDirs = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'];
        const missingDirs = expectedDirs.filter(dir => !fs.existsSync(path.join(themeFolder, dir)));

        if (missingDirs.length > 0) {
            console.warn(`Warning: Missing expected directories: ${missingDirs.join(', ')}`);
        }

        return themeFolder;
    }

    private collectLocalThemeFiles(themeFolder: string): Array<{ key: string, filePath: string, isImage: boolean }> {
        const files: Array<{ key: string, filePath: string, isImage: boolean }> = [];

        // Recursively find all files in the theme folder
        const walkDir = (dir: string, baseDir: string) => {
            const items = fs.readdirSync(dir);

            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    walkDir(itemPath, baseDir);
                } else if (stat.isFile()) {
                    const relativePath = path.relative(baseDir, itemPath);
                    const key = relativePath.replace(/\\/g, '/'); // Normalize path separators

                    // Determine if it's a binary file (images, fonts, etc.)
                    const ext = path.extname(key).toLowerCase();
                    const binaryExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf'];
                    const isImage = binaryExts.includes(ext);

                    files.push({
                        key,
                        filePath: itemPath,
                        isImage
                    });
                }
            });
        };

        walkDir(themeFolder, themeFolder);
        return files;
    }

    private analyzeChanges(localFiles: Array<{ key: string, filePath: string, isImage: boolean }>, remoteAssets: Asset[], mirror: boolean = false): {
        toUpload: Array<{ key: string, filePath: string, isImage: boolean }>;
        toUpdate: Array<{ key: string, filePath: string, isImage: boolean }>;
        toDelete: Asset[];
    } {
        const remoteAssetMap = new Map<string, Asset>();
        remoteAssets.forEach(asset => remoteAssetMap.set(asset.key, asset));

        const localFileMap = new Map<string, { key: string, filePath: string, isImage: boolean }>();
        localFiles.forEach(file => localFileMap.set(file.key, file));

        const toUpload: Array<{ key: string, filePath: string, isImage: boolean }> = [];
        const toUpdate: Array<{ key: string, filePath: string, isImage: boolean }> = [];
        const toDelete: Asset[] = [];

        // Check local files against remote
        localFiles.forEach(localFile => {
            const remoteAsset = remoteAssetMap.get(localFile.key);
            if (!remoteAsset) {
                // New file - needs to be uploaded
                toUpload.push(localFile);
            } else {
                // File exists remotely - assume it needs updating
                // (We could add timestamp/checksum comparison here in the future)
                toUpdate.push(localFile);
            }
        });

        // Check for remote files that don't exist locally (only populate in mirror mode)
        if (mirror) {
            remoteAssets.forEach(remoteAsset => {
                if (!localFileMap.has(remoteAsset.key)) {
                    toDelete.push(remoteAsset);
                }
            });
        }

        return { toUpload, toUpdate, toDelete };
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
        let assetData: any;

        if (file.isImage) {
            // Binary file - send as base64 attachment
            assetData = {
                key: file.key,
                attachment: fileContent.toString('base64')
            };
        } else {
            // Text file - send as value
            assetData = {
                key: file.key,
                value: fileContent.toString('utf8')
            };
        }

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ asset: assetData })
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

    formatAsYaml(themes: Theme[]): string {
        return yaml.dump({ themes }, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false
        });
    }
}

export async function themesListCommand(options: {
    site?: string;
    accessToken?: string;
}): Promise<void> {
    const themes = new ShopifyThemes();

    try {
        const result = await themes.list(options);

        if (result.themes.length === 0) {
            console.log('themes: []');
            return;
        }

        const yaml = themes.formatAsYaml(result.themes);
        console.log(yaml);

    } catch (error: any) {
        console.error(`Failed to list themes: ${error.message}`);
        process.exit(1);
    }
}

export async function themesPullCommand(options: {
    themeName: string;
    output: string;
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

        await themes.pull(options.themeName, options.output, site, accessToken);

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