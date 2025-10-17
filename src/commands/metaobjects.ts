import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { GraphQLClient } from '../utils/graphql-client';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

interface MetaobjectField {
    key: string;
    value: string;
}

interface Metaobject {
    id: string;
    handle: string;
    type: string;
    displayName?: string;
    updatedAt?: string;
    fields: MetaobjectField[];
}

interface MetaobjectMetadata {
    id: string;
    handle: string;
    type: string;
    displayName?: string;
    updatedAt?: string;
}

interface FieldDefinition {
    key: string;
    name: string;
    description?: string;
    required: boolean;
    type: {
        name: string;
        category: string;
    };
    validations?: Array<{
        name: string;
        value: string;
    }>;
}

interface MetaobjectDefinition {
    type: string;
    name: string;
    description?: string;
    fieldDefinitions: FieldDefinition[];
    access: {
        admin: string;
        storefront: string;
    };
}

export interface MetaobjectsPullOptions {
    output: string;
    maxMetaobjects?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface MetaobjectsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyMetaobjects {
    private static readonly JSON_EXTENSION = '.json';
    private static readonly META_EXTENSION = '.meta';

    async pull(outputPath: string, site: string, accessToken: string, maxMetaobjects?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull metaobjects${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = IOUtility.buildResourcePath(outputPath, 'metaobjects');
        dryRunManager.logAction('pull', `metaobjects to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        const definitions = await this.fetchMetaobjectDefinitions(site, accessToken);
        Logger.info(`Found ${definitions.length} metaobject type(s)`);

        const metaobjectsByType = new Map<string, Metaobject[]>();
        let totalMetaobjects = 0;

        for (const definition of definitions) {
            const metaobjects = await this.fetchMetaobjects(site, accessToken, definition.type, maxMetaobjects);
            Logger.info(`  ${definition.type}: ${metaobjects.length} metaobject(s)`);
            metaobjectsByType.set(definition.type, metaobjects);
            totalMetaobjects += metaobjects.length;
        }

        Logger.info(`Found ${totalMetaobjects} remote metaobjects to sync`);

        const toDelete: string[] = [];

        if (mirror) {
            const allMetaobjects: Metaobject[] = [];
            metaobjectsByType.forEach(metaobjects => allMetaobjects.push(...metaobjects));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, definitions, allMetaobjects));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: totalMetaobjects + definitions.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Metaobjects'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (const definition of definitions) {
            const metaobjects = metaobjectsByType.get(definition.type) || [];
            const typeOutputPath = path.join(finalOutputPath, definition.type);
            IOUtility.ensureDirectoryExists(typeOutputPath);

            await this.saveDefinition(definition, typeOutputPath);

            if (metaobjects.length > 0) {
                const result = await this.downloadMetaobjects(metaobjects, typeOutputPath);
                downloadResult.downloaded += result.downloaded;
                downloadResult.failed += result.failed;
                downloadResult.errors.push(...result.errors);
            }
        }

        if (totalMetaobjects === 0) {
            Logger.info('No metaobjects to sync');
        }

        const summary = [`Successfully pulled metaobjects to ${finalOutputPath}`];
        if (downloadResult.downloaded > 0) {
            summary.push(`Downloaded: ${downloadResult.downloaded}`);
        }
        if (definitions.length > 0) {
            summary.push(`Definitions: ${definitions.length}`);
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
        dryRunManager.logDryRunHeader(`Push metaobjects${mirror ? ' (Mirror Mode)' : ''}`);

        const metaobjectsPath = IOUtility.prepareResourcePath(inputPath, 'metaobjects');
        dryRunManager.logAction('push', `local metaobjects from "${metaobjectsPath}"`);

        const localFiles = this.collectLocalMetaobjectFiles(metaobjectsPath);

        const types = await this.fetchMetaobjectTypes(site, accessToken);
        let allRemoteMetaobjects: Metaobject[] = [];

        for (const currentType of types) {
            const metaobjects = await this.fetchMetaobjects(site, accessToken, currentType);
            allRemoteMetaobjects = allRemoteMetaobjects.concat(metaobjects);
        }

        const toDelete: Array<{ key: string, metaobject: Metaobject }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { handle: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            allRemoteMetaobjects.forEach((remoteMetaobject: Metaobject) => {
                if (!localFileMap.has(remoteMetaobject.handle)) {
                    toDelete.push({ key: `${remoteMetaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`, metaobject: remoteMetaobject });
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote metaobjects will be deleted`);
            }
        }

        Logger.info(`Found ${localFiles.length} local metaobjects to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(item => item.key),
            itemType: 'Metaobjects'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };
        if (localFiles.length > 0) {
            Object.assign(uploadResult, await this.uploadMetaobjects(site, accessToken, localFiles));

            if (uploadResult.failed > 0) {
                Logger.error(`\nUpload failures encountered:`);
                uploadResult.errors.forEach(error => Logger.error(`  - ${error}`));
                throw new Error(`Push failed: ${uploadResult.failed} metaobject(s) failed to upload. See above for details.`);
            }
        } else {
            Logger.info('No metaobjects to upload');
        }

        const deleteResult = { deleted: 0, failed: 0, errors: [] as string[] };
        if (mirror && toDelete.length > 0) {
            Object.assign(deleteResult, await this.deleteMetaobjects(site, accessToken, toDelete.map(item => item.metaobject)));

            if (deleteResult.failed > 0) {
                Logger.error(`\nDeletion failures encountered:`);
                deleteResult.errors.forEach(error => Logger.error(`  - ${error}`));
                throw new Error(`Push failed: ${deleteResult.failed} metaobject(s) failed to delete. See above for details.`);
            }
        }

        const summary = ['Successfully pushed metaobjects'];
        if (uploadResult.uploaded > 0) {
            summary.push(`Uploaded: ${uploadResult.uploaded}`);
        }
        if (deleteResult.deleted > 0) {
            summary.push(`Deleted: ${deleteResult.deleted}`);
        }

        Logger.success(summary.join(' | '));
    }

    private async fetchMetaobjectTypes(site: string, accessToken: string): Promise<string[]> {
        const definitions = await this.fetchMetaobjectDefinitions(site, accessToken);
        return definitions.map(def => def.type);
    }

    private async fetchMetaobjectDefinitions(site: string, accessToken: string): Promise<MetaobjectDefinition[]> {
        const query = `
            query($first: Int!, $after: String) {
                metaobjectDefinitions(first: $first, after: $after) {
                    nodes {
                        type
                        name
                        description
                        fieldDefinitions {
                            key
                            name
                            description
                            required
                            type {
                                name
                                category
                            }
                            validations {
                                name
                                value
                            }
                        }
                        access {
                            admin
                            storefront
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const allDefinitions: MetaobjectDefinition[] = [];
        let hasNextPage = true;
        let after: string | null = null;
        const perPage = 250;

        while (hasNextPage) {
            const data: {
                metaobjectDefinitions: {
                    nodes: MetaobjectDefinition[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                }
            } = await GraphQLClient.query<{
                metaobjectDefinitions: {
                    nodes: MetaobjectDefinition[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                }
            }>(
                site,
                accessToken,
                query,
                { first: perPage, after },
                'metaobjects'
            );

            allDefinitions.push(...data.metaobjectDefinitions.nodes);
            hasNextPage = data.metaobjectDefinitions.pageInfo.hasNextPage;
            after = data.metaobjectDefinitions.pageInfo.endCursor;
        }

        return allDefinitions;
    }

    private async fetchMetaobjects(site: string, accessToken: string, type: string, maxCount?: number): Promise<Metaobject[]> {
        const query = `
            query GetMetaobjects($type: String!, $first: Int!, $after: String) {
                metaobjects(type: $type, first: $first, after: $after) {
                    nodes {
                        id
                        handle
                        type
                        displayName
                        updatedAt
                        fields {
                            key
                            value
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const allMetaobjects: Metaobject[] = [];
        let hasNextPage = true;
        let after: string | null = null;
        const perPage = maxCount || 250;

        while (hasNextPage && (!maxCount || allMetaobjects.length < maxCount)) {
            const data: {
                metaobjects: {
                    nodes: Metaobject[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                }
            } = await GraphQLClient.query<{
                metaobjects: {
                    nodes: Metaobject[];
                    pageInfo: { hasNextPage: boolean; endCursor: string | null };
                }
            }>(
                site,
                accessToken,
                query,
                { type, first: perPage, after },
                'metaobjects'
            );

            allMetaobjects.push(...data.metaobjects.nodes);
            hasNextPage = data.metaobjects.pageInfo.hasNextPage;
            after = data.metaobjects.pageInfo.endCursor;
        }

        if (maxCount && allMetaobjects.length > maxCount) {
            return allMetaobjects.slice(0, maxCount);
        }

        return allMetaobjects;
    }

    private async saveDefinition(definition: MetaobjectDefinition, typeOutputPath: string): Promise<void> {
        const definitionPath = path.join(typeOutputPath, `${definition.type}.definition${ShopifyMetaobjects.JSON_EXTENSION}`);
        fs.writeFileSync(definitionPath, JSON.stringify(definition, null, 2), 'utf8');
    }

    private getMetaobjectFilePath(outputPath: string, metaobject: Metaobject): string {
        return path.join(outputPath, `${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);
    }

    private findLocalFilesToDelete(outputPath: string, definitions: MetaobjectDefinition[], allMetaobjects: Metaobject[]): string[] {
        const toDelete: string[] = [];

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        const remoteTypeSet = new Set(definitions.map(d => d.type));
        const localTypeDirs = fs.readdirSync(outputPath, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => entry.name);

        for (const typeDir of localTypeDirs) {
            if (!remoteTypeSet.has(typeDir)) {
                const typePath = path.join(outputPath, typeDir);
                IOUtility.walkDirectory(typePath, (filePath, relativePath) => {
                    toDelete.push(path.join(typeDir, relativePath));
                });
                continue;
            }

            const typePath = path.join(outputPath, typeDir);
            const remoteHandlesForType = new Set(
                allMetaobjects
                    .filter(m => m.type === typeDir)
                    .map(m => `${m.handle}${ShopifyMetaobjects.JSON_EXTENSION}`)
            );

            const localFiles = IOUtility.findFilesToDelete(typePath, remoteHandlesForType, {
                fileExtension: ShopifyMetaobjects.JSON_EXTENSION
            });

            localFiles.forEach(file => {
                const fileName = path.basename(file);
                if (!fileName.endsWith('.definition.json')) {
                    toDelete.push(path.join(typeDir, file));
                }
            });
        }

        return toDelete;
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

    private async downloadMetaobjects(metaobjects: Metaobject[], outputPath: string): Promise<{ downloaded: number, failed: number, errors: string[] }> {
        const result = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < metaobjects.length; i++) {
            const metaobject = metaobjects[i];
            Logger.progress(i + 1, metaobjects.length, `Downloading ${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.downloadSingleMetaobject(metaobject, outputPath),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.downloaded++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${metaobject.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${metaobject.handle}: ${message}`);
            }
        }

        return result;
    }

    private async downloadSingleMetaobject(metaobject: Metaobject, outputPath: string): Promise<void> {
        const filePath = this.getMetaobjectFilePath(outputPath, metaobject);

        IOUtility.ensureDirectoryExists(path.dirname(filePath));

        const content: { [key: string]: string } = {};
        metaobject.fields.forEach(field => {
            content[field.key] = field.value;
        });

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');

        const metadata: MetaobjectMetadata = {
            id: metaobject.id,
            handle: metaobject.handle,
            type: metaobject.type,
            displayName: metaobject.displayName,
            updatedAt: metaobject.updatedAt
        };
        const metaPath = `${filePath}${ShopifyMetaobjects.META_EXTENSION}`;
        fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
    }

    private collectLocalMetaobjectFiles(inputPath: string): Array<{ handle: string, filePath: string, metaobjectId?: string, type?: string }> {
        const files: Array<{ handle: string, filePath: string, metaobjectId?: string, type?: string }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const typeDirs = fs.readdirSync(inputPath, { withFileTypes: true })
            .filter(entry => entry.isDirectory());

        for (const typeDir of typeDirs) {
            const typePath = path.join(inputPath, typeDir.name);
            const entries = fs.readdirSync(typePath, { withFileTypes: true });

            entries.forEach(entry => {
                if (entry.isFile() &&
                    entry.name.endsWith(ShopifyMetaobjects.JSON_EXTENSION) &&
                    !entry.name.endsWith('.definition.json')) {

                    const handle = entry.name.replace(ShopifyMetaobjects.JSON_EXTENSION, '');
                    const filePath = path.join(typePath, entry.name);
                    const metaPath = `${filePath}${ShopifyMetaobjects.META_EXTENSION}`;

                    let metaobjectId: string | undefined;
                    let type: string = typeDir.name;

                    if (fs.existsSync(metaPath)) {
                        try {
                            const metaContent = fs.readFileSync(metaPath, 'utf8');
                            const metadata = yaml.load(metaContent) as MetaobjectMetadata;
                            metaobjectId = metadata.id;
                            type = metadata.type;
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            Logger.warn(`Failed to read metadata for ${entry.name}: ${message}`);
                        }
                    }

                    files.push({ handle, filePath, metaobjectId, type });
                }
            });
        }

        return files;
    }

    private async uploadMetaobjects(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, metaobjectId?: string }>): Promise<{ uploaded: number, failed: number, errors: string[] }> {
        const result = { uploaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(i + 1, files.length, `Uploading ${file.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            try {
                await RetryUtility.withRetry(
                    () => this.uploadSingleMetaobject(site, accessToken, file),
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

    private async uploadSingleMetaobject(site: string, accessToken: string, file: { handle: string, filePath: string, metaobjectId?: string }): Promise<void> {
        const contentJson = fs.readFileSync(file.filePath, 'utf8');
        const content = JSON.parse(contentJson);

        const metaPath = `${file.filePath}${ShopifyMetaobjects.META_EXTENSION}`;
        let type = 'unknown';
        let displayName = file.handle;

        if (fs.existsSync(metaPath)) {
            try {
                const metaContent = fs.readFileSync(metaPath, 'utf8');
                const metadata = yaml.load(metaContent) as MetaobjectMetadata;
                type = metadata.type;
                if (metadata.displayName) {
                    displayName = metadata.displayName;
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to read metadata for ${file.handle}, using defaults: ${message}`);
            }
        }

        const fields = Object.entries(content).map(([key, value]) => ({
            key,
            value: String(value)
        }));

        const mutation = `
            mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
                metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
                    metaobject {
                        id
                        handle
                        displayName
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const variables = {
            handle: {
                type,
                handle: file.handle
            },
            metaobject: {
                fields
            }
        };

        const data = await GraphQLClient.mutation<{
            metaobjectUpsert: {
                metaobject: { id: string; handle: string; displayName?: string };
                userErrors: Array<{ field: string[]; message: string }>;
            }
        }>(site, accessToken, mutation, variables, 'metaobjects');

        if (data.metaobjectUpsert.userErrors && data.metaobjectUpsert.userErrors.length > 0) {
            throw new Error(`User errors: ${JSON.stringify(data.metaobjectUpsert.userErrors)}`);
        }
    }

    private async deleteMetaobjects(site: string, accessToken: string, metaobjects: Metaobject[]): Promise<{ deleted: number, failed: number, errors: string[] }> {
        const result = { deleted: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < metaobjects.length; i++) {
            const metaobject = metaobjects[i];
            Logger.progress(i + 1, metaobjects.length, `Deleting ${metaobject.handle}`);

            try {
                await RetryUtility.withRetry(
                    () => this.deleteSingleMetaobject(site, accessToken, metaobject),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.deleted++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.error(`Failed to delete ${metaobject.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${metaobject.handle}: ${message}`);
            }
        }

        return result;
    }

    private async deleteSingleMetaobject(site: string, accessToken: string, metaobject: Metaobject): Promise<void> {
        const mutation = `
            mutation DeleteMetaobject($id: ID!) {
                metaobjectDelete(id: $id) {
                    deletedId
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const data = await GraphQLClient.mutation<{
            metaobjectDelete: {
                deletedId?: string;
                userErrors: Array<{ field: string[]; message: string }>;
            }
        }>(site, accessToken, mutation, { id: metaobject.id }, 'metaobjects');

        if (data.metaobjectDelete.userErrors && data.metaobjectDelete.userErrors.length > 0) {
            throw new Error(`User errors: ${JSON.stringify(data.metaobjectDelete.userErrors)}`);
        }
    }
}

export async function metaobjectsPullCommand(options: MetaobjectsPullOptions): Promise<void> {
    const metaobjects = new ShopifyMetaobjects();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await metaobjects.pull(
        options.output,
        credentials.site,
        credentials.accessToken,
        options.maxMetaobjects,
        options.dryRun,
        options.mirror
    );
}

export async function metaobjectsPushCommand(options: MetaobjectsPushOptions): Promise<void> {
    const metaobjects = new ShopifyMetaobjects();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await metaobjects.push(
        options.input,
        credentials.site,
        credentials.accessToken,
        options.dryRun,
        options.mirror
    );
}
