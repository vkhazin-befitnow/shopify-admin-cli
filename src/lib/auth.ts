import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createInterface } from 'readline';

interface StoreCredentials {
    site: string;
    accessToken: string;
    authenticatedAt: string;
}

interface EnvStoreConfig {
    site: string;
    accessToken: string;
}

export class ShopifyAuth {
    private credentialsDir: string;

    constructor() {
        // Store in project directory, not home directory
        this.credentialsDir = path.join(process.cwd(), '.shopify-admin-cli');
    }

    /**
     * Universal authentication method supporting:
     * 1. Environment variables (CI/CD)
     * 2. Command line parameters (interactive)
     * 3. Interactive prompts (fallback)
     */
    async authenticate(options: {
        site?: string;
        accessToken?: string;
    } = {}): Promise<StoreCredentials> {

        // Try environment variables first (best for CI/CD)
        const envCredentials = this.getCredentialsFromEnv(options.site);
        if (envCredentials) {
            console.log(`✅ Using credentials from environment variables for ${envCredentials.site}`);
            return {
                site: envCredentials.site,
                accessToken: envCredentials.accessToken,
                authenticatedAt: new Date().toISOString()
            };
        }

        // Use provided CLI options
        let { site, accessToken } = options;

        // Interactive prompts if missing (for interactive use)
        if (!site || !accessToken) {
            const interactive = await this.getCredentialsInteractively(site, accessToken);
            site = interactive.site;
            accessToken = interactive.accessToken;
        }

        // Validate credentials
        const isValid = await this.validateCredentials(site!, accessToken!);
        if (!isValid) {
            throw new Error('Invalid credentials or API access denied');
        }

        const credentials: StoreCredentials = {
            site: site!,
            accessToken: accessToken!,
            authenticatedAt: new Date().toISOString()
        };

        // Save to file for future use
        this.saveCredentials(credentials);

        console.log(`✅ Successfully authenticated with ${site}`);
        return credentials;
    }

    /**
     * Load credentials for a specific store from multiple sources
     */
    async loadCredentials(site: string): Promise<StoreCredentials | null> {
        // Try environment variables first
        const envCredentials = this.getCredentialsFromEnv(site);
        if (envCredentials) {
            return {
                site: envCredentials.site,
                accessToken: envCredentials.accessToken,
                authenticatedAt: 'from-environment'
            };
        }

        // Try stored file credentials
        return this.getStoredCredentials(site);
    }

    /**
     * List all available stores from both env vars and files
     */
    listStores(): Array<{ source: 'environment' | 'file'; site: string; authenticatedAt: string }> {
        const stores: Array<{ source: 'environment' | 'file'; site: string; authenticatedAt: string }> = [];

        // Add environment-based stores
        const envStores = this.getEnvStores();
        envStores.forEach(store => {
            stores.push({
                source: 'environment',
                site: store.site,
                authenticatedAt: 'from-environment'
            });
        });

        // Add file-based stores
        const fileStores = this.getFileStores();
        fileStores.forEach(store => {
            // Don't duplicate if already in env vars
            if (!stores.find(s => s.site === store.site)) {
                stores.push({
                    source: 'file',
                    site: store.site,
                    authenticatedAt: store.authenticatedAt
                });
            }
        });

        return stores;
    }

    /**
     * Get credentials from environment variables
     * Supports both single store and multiple stores
     */
    private getCredentialsFromEnv(targetSite?: string): EnvStoreConfig | null {
        // Single store environment (simple case)
        const singleSite = process.env.SHOPIFY_STORE_DOMAIN;
        const singleToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (singleSite && singleToken) {
            // If target site matches or no target specified, use single store config
            if (!targetSite || targetSite === singleSite) {
                return {
                    site: singleSite,
                    accessToken: singleToken
                };
            }
        }

        // Multi-store environment (advanced case)
        if (targetSite) {
            const storeName = targetSite.replace('.myshopify.com', '').replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
            const accessToken = process.env[`SHOPIFY_${storeName}_ACCESS_TOKEN`];

            if (accessToken) {
                return {
                    site: targetSite,
                    accessToken
                };
            }
        }

        return null;
    }

    /**
     * Get all stores configured via environment variables
     */
    private getEnvStores(): EnvStoreConfig[] {
        const stores: EnvStoreConfig[] = [];

        // Single store
        const singleSite = process.env.SHOPIFY_STORE_DOMAIN;
        const singleToken = process.env.SHOPIFY_ACCESS_TOKEN;

        if (singleSite && singleToken) {
            stores.push({
                site: singleSite,
                accessToken: singleToken
            });
        }

        // Multi-store (scan environment for patterns)
        Object.keys(process.env).forEach(key => {
            const match = key.match(/^SHOPIFY_([A-Z0-9_]+)_ACCESS_TOKEN$/);
            if (match) {
                const storeName = match[1];
                const accessToken = process.env[key];
                const storeDomain = process.env[`SHOPIFY_${storeName}_DOMAIN`];

                if (accessToken && storeDomain) {
                    stores.push({
                        site: storeDomain,
                        accessToken
                    });
                }
            }
        });

        return stores;
    }

    /**
     * Interactive credential collection
     */
    private async getCredentialsInteractively(
        site?: string,
        accessToken?: string
    ): Promise<{ site: string; accessToken: string }> {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt: string): Promise<string> => {
            return new Promise(resolve => rl.question(prompt, resolve));
        };

        try {
            if (!site) {
                site = await question('Enter Shopify store domain (e.g., mystore.myshopify.com): ');
            }

            if (!accessToken) {
                accessToken = await question('Enter Admin API Access Token (starts with shpat_): ');
            }

            return { site: site!, accessToken: accessToken! };
        } finally {
            rl.close();
        }
    }

    /**
     * Validate credentials by making a test API call
     */
    private async validateCredentials(site: string, accessToken: string): Promise<boolean> {
        try {
            const response = await fetch(`https://${site}/admin/api/2023-10/shop.json`, {
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Credential validation failed:', error);
            return false;
        }
    }

    /**
     * Save credentials to file
     */
    private saveCredentials(credentials: StoreCredentials): void {
        if (!fs.existsSync(this.credentialsDir)) {
            fs.mkdirSync(this.credentialsDir, { recursive: true });
        }

        const storeName = credentials.site.replace('.myshopify.com', '');
        const credentialsPath = path.join(this.credentialsDir, storeName);

        const encryptedCredentials = {
            ...credentials,
            accessToken: this.encrypt(credentials.accessToken)
        };

        fs.writeFileSync(credentialsPath, JSON.stringify(encryptedCredentials, null, 2));
        console.log(`💾 Credentials saved to ${credentialsPath}`);
    }

    /**
     * Load stored credentials from file
     */
    private getStoredCredentials(site: string): StoreCredentials | null {
        const storeName = site.replace('.myshopify.com', '');
        const credentialsPath = path.join(this.credentialsDir, storeName);

        if (fs.existsSync(credentialsPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                return {
                    ...data,
                    accessToken: this.decrypt(data.accessToken)
                };
            } catch (error) {
                console.error(`Error reading credentials for ${site}:`, error);
            }
        }

        return null;
    }

    /**
     * Get all file-based stores
     */
    private getFileStores(): Array<{ site: string; authenticatedAt: string }> {
        if (!fs.existsSync(this.credentialsDir)) {
            return [];
        }

        return fs.readdirSync(this.credentialsDir)
            .filter(file => !file.startsWith('.'))
            .map(storeName => {
                const credentialsPath = path.join(this.credentialsDir, storeName);
                try {
                    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
                    return {
                        site: credentials.site,
                        authenticatedAt: credentials.authenticatedAt
                    };
                } catch (error) {
                    return null;
                }
            })
            .filter(Boolean) as Array<{ site: string; authenticatedAt: string }>;
    }

    /**
     * Simple encryption for stored secrets
     */
    private encrypt(text: string): string {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync('shopify-admin-cli', 'salt', 32);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, key);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    }

    /**
     * Simple decryption for stored secrets
     */
    private decrypt(encryptedText: string): string {
        const algorithm = 'aes-256-cbc';
        const key = crypto.scryptSync('shopify-admin-cli', 'salt', 32);
        const [ivHex, encrypted] = encryptedText.split(':');
        const decipher = crypto.createDecipher(algorithm, key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}
