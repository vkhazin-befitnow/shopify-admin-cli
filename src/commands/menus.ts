import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { GraphQLClient } from '../utils/graphql-client';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

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

export class ShopifyMenus extends BaseResourceCommand<Menu, MenuMetadata> {
    getResourceName(): string {
        return 'menus';
    }

    getFileExtension(): string {
        return '.json';
    }

    async fetchResources(site: string, accessToken: string): Promise<Menu[]> {
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

        const data = await GraphQLClient.query<{ menus: { edges: Array<{ node: Menu }> } }>(
            site,
            accessToken,
            query,
            undefined,
            'menus'
        );
        return data.menus.edges.map(edge => edge.node);
    }

    getResourceHandle(menu: Menu): string {
        return menu.handle;
    }

    extractMetadata(menu: Menu): MenuMetadata {
        return {
            id: menu.id,
            title: menu.title,
            handle: menu.handle
        };
    }

    async downloadSingleResource(menu: Menu, outputPath: string): Promise<void> {
        const filePath = this.getResourceFilePath(outputPath, menu);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        fs.writeFileSync(filePath, JSON.stringify(menu.items, null, 2), 'utf8');
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<MenuMetadata>
    ): Promise<void> {
        const linksJson = fs.readFileSync(file.filePath, 'utf8');
        const links = JSON.parse(linksJson) as MenuLink[];

        let title = file.handle;
        if (file.metadata?.title) {
            title = file.metadata.title;
        }

        if (file.metadata?.id) {
            await this.updateMenu(site, accessToken, file.metadata.id, title, links);
        } else {
            await this.createMenu(site, accessToken, title, file.handle, links);
        }
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        menu: Menu
    ): Promise<void> {
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

        const data = await GraphQLClient.mutation(site, accessToken, mutation, undefined, 'menus');

        if (data.menuDelete.userErrors && data.menuDelete.userErrors.length > 0) {
            throw new Error(`User errors: ${JSON.stringify(data.menuDelete.userErrors)}`);
        }
    }

    private async updateMenu(site: string, accessToken: string, menuId: string, title: string, items: MenuLink[]): Promise<void> {
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

        const data = await GraphQLClient.mutation(site, accessToken, mutation, undefined, 'menus');

        if (data.menuUpdate.userErrors && data.menuUpdate.userErrors.length > 0) {
            throw new Error(`User errors: ${JSON.stringify(data.menuUpdate.userErrors)}`);
        }
    }

    private async createMenu(site: string, accessToken: string, title: string, handle: string, items: MenuLink[]): Promise<void> {
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

        const data = await GraphQLClient.mutation(site, accessToken, mutation, undefined, 'menus');

        if (data.menuCreate.userErrors && data.menuCreate.userErrors.length > 0) {
            throw new Error(`User errors: ${JSON.stringify(data.menuCreate.userErrors)}`);
        }
    }
}

export async function menusPullCommand(options: MenusPullOptions): Promise<void> {
    const menus = new ShopifyMenus();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await menus.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxMenus,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function menusPushCommand(options: MenusPushOptions): Promise<void> {
    const menus = new ShopifyMenus();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await menus.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
