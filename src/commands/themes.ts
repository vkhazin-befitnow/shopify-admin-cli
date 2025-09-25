interface EnvStoreConfig {
    site: string;
    accessToken: string;
}

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

export class ShopifyThemes {
    constructor() { }

    /**
     * List all themes for the store
     */
    async list(options?: {
        site?: string;
        accessToken?: string;
    }): Promise<ThemeListResult> {
        // Get credentials using priority: 1. CLI args, 2. env vars, 3. error
        let site = options?.site;
        let accessToken = options?.accessToken;

        // If no explicit parameters provided, try environment variables
        if (!site || !accessToken) {
            const envCredentials = this.getCredentialsFromEnv();
            if (envCredentials) {
                site = site || envCredentials.site;
                accessToken = accessToken || envCredentials.accessToken;
            }
        }

        // Error if credentials are still missing
        if (!site || !accessToken) {
            throw new Error('Missing credentials. Provide either:\n' +
                '1. CLI arguments: --site <domain> --access-token <token>\n' +
                '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
        }

        return await this.fetchThemes(site, accessToken);
    }

    /**
     * Fetch themes using REST API
     */
    private async fetchThemes(site: string, accessToken: string): Promise<ThemeListResult> {
        const apiVersion = '2025-01';
        const url = `https://${site}/admin/api/${apiVersion}/themes.json`;

        try {
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

        } catch (error: any) {
            if (error.message.includes('fetch')) {
                throw new Error(`Network error: ${error.message}`);
            }
            throw error;
        }
    }

    private getCredentialsFromEnv(): EnvStoreConfig | null {
        const site = process.env.SHOPIFY_STORE_DOMAIN;
        const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (site && accessToken) {
            return { site, accessToken };
        }

        return null;
    }

    /**
     * Format themes data as YAML
     */
    formatAsYaml(themes: Theme[]): string {
        if (themes.length === 0) {
            return 'themes: []';
        }

        let yaml = 'themes:\n';
        
        themes.forEach(theme => {
            yaml += `  - id: ${theme.id}\n`;
            yaml += `    name: "${theme.name}"\n`;
            yaml += `    role: ${theme.role}\n`;
            yaml += `    previewable: ${theme.previewable}\n`;
            yaml += `    processing: ${theme.processing}\n`;
            yaml += `    created_at: "${theme.created_at}"\n`;
            yaml += `    updated_at: "${theme.updated_at}"\n`;
            
            if (theme.theme_store_id) {
                yaml += `    theme_store_id: ${theme.theme_store_id}\n`;
            }
        });

        return yaml;
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

        // Output as YAML format
        const yaml = themes.formatAsYaml(result.themes);
        console.log(yaml);

    } catch (error: any) {
        console.error(`Failed to list themes: ${error.message}`);
        process.exit(1);
    }
}