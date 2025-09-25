import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RetryUtility } from '../utils/retry';
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