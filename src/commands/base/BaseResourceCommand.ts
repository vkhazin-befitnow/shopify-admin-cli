import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { HttpClient } from '../../utils/http-client';
import { RetryUtility } from '../../utils/retry';
import { DryRunManager } from '../../utils/dry-run';
import { IOUtility } from '../../utils/io';
import { Logger } from '../../utils/logger';
import { SHOPIFY_API } from '../../settings';
import { PullOptions, PushOptions, LocalFile, BatchResult } from './types';

export abstract class BaseResourceCommand<TResource, TMetadata> {
    protected httpClient = new HttpClient();
    protected static readonly META_EXTENSION = '.meta';

    abstract getResourceName(): string;
    abstract getFileExtension(): string;
    abstract fetchResources(site: string, accessToken: string): Promise<TResource[]>;
    abstract getResourceHandle(resource: TResource): string;
    abstract extractMetadata(resource: TResource): TMetadata;
    abstract downloadSingleResource(resource: TResource, outputPath: string): Promise<void>;
    abstract uploadSingleResource(site: string, accessToken: string, file: LocalFile<TMetadata>): Promise<void>;
    abstract deleteSingleResource(site: string, accessToken: string, resource: TResource): Promise<void>;

    async pull(options: PullOptions): Promise<void> {
        const dryRunManager = new DryRunManager(options.dryRun || false);
        dryRunManager.logDryRunHeader(
            `Pull ${this.getResourceName()}${options.mirror ? ' (Mirror Mode)' : ''}`
        );

        const finalOutputPath = IOUtility.buildResourcePath(
            options.output,
            this.getResourceName() as any
        );
        dryRunManager.logAction('pull', `${this.getResourceName()} to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        let resources = await this.fetchResources(options.site, options.accessToken);

        if (options.maxItems && options.maxItems > 0) {
            resources = resources.slice(0, options.maxItems);
            Logger.info(`Limited to first ${resources.length} ${this.getResourceName()} for testing`);
        } else {
            Logger.info(`Found ${resources.length} remote ${this.getResourceName()} to sync`);
        }

        const toDelete: string[] = [];

        if (options.mirror) {
            const remoteHandles = new Set(
                resources.map(r => `${this.getResourceHandle(r)}${this.getFileExtension()}`)
            );
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteHandles));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: resources.length,
            itemsToDelete: options.mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: this.capitalizeFirst(this.getResourceName())
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (options.mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };
        if (resources.length > 0) {
            Object.assign(downloadResult, await this.downloadResources(resources, finalOutputPath));
        } else {
            Logger.info(`No ${this.getResourceName()} to sync`);
        }

        const summary = [`Successfully pulled ${this.getResourceName()} to ${finalOutputPath}`];
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

    async push(options: PushOptions): Promise<void> {
        const dryRunManager = new DryRunManager(options.dryRun || false);
        dryRunManager.logDryRunHeader(
            `Push ${this.getResourceName()}${options.mirror ? ' (Mirror Mode)' : ''}`
        );

        const resourcePath = IOUtility.prepareResourcePath(
            options.input,
            this.getResourceName() as any
        );
        dryRunManager.logAction('push', `local ${this.getResourceName()} from "${resourcePath}"`);

        const localFiles = this.collectLocalFiles(resourcePath);

        const remoteResources = await this.fetchResources(options.site, options.accessToken);

        const toDelete: Array<{ key: string; resource: TResource }> = [];

        if (options.mirror) {
            const localFileMap = new Map<string, LocalFile<TMetadata>>();
            localFiles.forEach(file => localFileMap.set(file.handle, file));

            remoteResources.forEach(remoteResource => {
                const handle = this.getResourceHandle(remoteResource);
                if (!localFileMap.has(handle)) {
                    toDelete.push({
                        key: `${handle}${this.getFileExtension()}`,
                        resource: remoteResource
                    });
                }
            });

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote ${this.getResourceName()} will be deleted`);
            }
        }

        Logger.info(`Found ${localFiles.length} local ${this.getResourceName()} to upload`);

        dryRunManager.logSummary({
            itemsToUpload: localFiles.length,
            itemsToDelete: options.mirror ? toDelete.length : undefined,
            deleteList: toDelete.map(item => item.key),
            itemType: this.capitalizeFirst(this.getResourceName())
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };
        if (localFiles.length > 0) {
            Object.assign(
                uploadResult,
                await this.uploadResources(options.site, options.accessToken, localFiles)
            );
        } else {
            Logger.info(`No ${this.getResourceName()} to upload`);
        }

        const deleteResult = { deleted: 0, failed: 0, errors: [] as string[] };
        if (options.mirror && toDelete.length > 0) {
            Object.assign(
                deleteResult,
                await this.deleteResources(
                    options.site,
                    options.accessToken,
                    toDelete.map(item => item.resource)
                )
            );
        }

        const summary = [`Successfully pushed ${this.getResourceName()}`];
        if (uploadResult.uploaded > 0) {
            summary.push(`Uploaded: ${uploadResult.uploaded}`);
        }
        if (deleteResult.deleted > 0) {
            summary.push(`Deleted: ${deleteResult.deleted}`);
        }
        if (uploadResult.failed > 0 || deleteResult.failed > 0) {
            summary.push(`Failed: ${uploadResult.failed + deleteResult.failed}`);
        }

        Logger.success(summary.join(' | '));

        const allErrors = [...uploadResult.errors, ...deleteResult.errors];
        if (allErrors.length > 0) {
            Logger.warn(`\nErrors encountered during push:`);
            allErrors.forEach(error => Logger.warn(`  - ${error}`));
        }
    }

    protected getResourceFilePath(outputPath: string, resource: TResource): string {
        return path.join(
            outputPath,
            `${this.getResourceHandle(resource)}${this.getFileExtension()}`
        );
    }

    protected writeMetadata(filePath: string, metadata: TMetadata): void {
        const metaPath = this.getMetadataPath(filePath);
        fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
    }

    protected readMetadata(filePath: string): TMetadata | undefined {
        const metaPath = this.getMetadataPath(filePath);

        if (!fs.existsSync(metaPath)) {
            return undefined;
        }

        try {
            const metaContent = fs.readFileSync(metaPath, 'utf8');
            return yaml.load(metaContent) as TMetadata;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            Logger.warn(`Failed to read metadata from ${metaPath}: ${message}`);
            return undefined;
        }
    }

    protected getMetadataPath(filePath: string): string {
        return `${filePath}${BaseResourceCommand.META_EXTENSION}`;
    }

    protected async downloadResources(
        resources: TResource[],
        outputPath: string
    ): Promise<BatchResult> {
        const result = { processed: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            const handle = this.getResourceHandle(resource);
            Logger.progress(
                i + 1,
                resources.length,
                `Downloading ${handle}${this.getFileExtension()}`
            );

            try {
                await RetryUtility.withRetry(
                    async () => {
                        await this.downloadSingleResource(resource, outputPath);
                        const filePath = this.getResourceFilePath(outputPath, resource);
                        const metadata = this.extractMetadata(resource);
                        this.writeMetadata(filePath, metadata);
                    },
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.processed++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to download ${handle}: ${message}`);
                result.failed++;
                result.errors.push(`${handle}: ${message}`);
            }
        }

        return result;
    }

    protected async uploadResources(
        site: string,
        accessToken: string,
        files: LocalFile<TMetadata>[]
    ): Promise<BatchResult> {
        const result = { processed: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            Logger.progress(
                i + 1,
                files.length,
                `Uploading ${file.handle}${this.getFileExtension()}`
            );

            try {
                await RetryUtility.withRetry(
                    () => this.uploadSingleResource(site, accessToken, file),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.processed++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to upload ${file.handle}: ${message}`);
                result.failed++;
                result.errors.push(`${file.handle}: ${message}`);
            }
        }

        return result;
    }

    protected async deleteResources(
        site: string,
        accessToken: string,
        resources: TResource[]
    ): Promise<BatchResult> {
        const result = { processed: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            const handle = this.getResourceHandle(resource);
            Logger.progress(i + 1, resources.length, `Deleting ${handle}`);

            try {
                await RetryUtility.withRetry(
                    () => this.deleteSingleResource(site, accessToken, resource),
                    SHOPIFY_API.RETRY_CONFIG
                );
                result.processed++;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.warn(`Failed to delete ${handle}: ${message}`);
                result.failed++;
                result.errors.push(`${handle}: ${message}`);
            }
        }

        return result;
    }

    protected collectLocalFiles(inputPath: string): LocalFile<TMetadata>[] {
        const files: LocalFile<TMetadata>[] = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && entry.name.endsWith(this.getFileExtension())) {
                const filePath = path.join(inputPath, entry.name);
                const handle = entry.name.replace(this.getFileExtension(), '');
                const metadata = this.readMetadata(filePath);

                files.push({ handle, filePath, metadata });
            }
        });

        return files;
    }

    protected findLocalFilesToDelete(
        outputPath: string,
        remoteHandles: Set<string>
    ): string[] {
        return IOUtility.findFilesToDelete(outputPath, remoteHandles, {
            fileExtension: this.getFileExtension()
        });
    }

    protected deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
        const deletedCount = IOUtility.deleteLocalFiles(outputPath, filesToDelete, (file, error) => {
            Logger.error(`Failed to delete ${file}: ${error}`);
        });

        filesToDelete.forEach(file => {
            Logger.info(`Deleted local file: ${file}`);
        });

        return deletedCount;
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}