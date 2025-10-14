import * as fs from 'fs';
import * as path from 'path';
import { BaseResourceCommand } from './base/BaseResourceCommand';
import { LocalFile } from './base/types';
import { GraphQLClient } from '../utils/graphql-client';
import { RetryUtility } from '../utils/retry';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';

interface FileNode {
    id: string;
    alt?: string;
    createdAt: string;
    fileStatus: string;
    preview?: {
        image?: {
            url: string;
        };
    };
    image?: {
        url: string;
    };
    sources?: Array<{
        url: string;
    }>;
    url?: string;
}

interface FileMetadata {
    id: string;
    alt?: string;
    createdAt: string;
    fileStatus: string;
    contentType: 'IMAGE' | 'VIDEO' | 'FILE';
}

interface FilesQueryResponse {
    data: {
        files: {
            edges: Array<{
                node: FileNode;
            }>;
            pageInfo: {
                hasNextPage: boolean;
                endCursor?: string;
            };
        };
    };
    errors?: Array<{
        message: string;
    }>;
}

interface FilesPullOptions {
    site?: string;
    accessToken?: string;
    output: string;
    maxFiles?: number;
    dryRun: boolean;
    mirror: boolean;
}

interface FilesPushOptions {
    site?: string;
    accessToken?: string;
    input: string;
    dryRun: boolean;
    mirror: boolean;
}

interface UserError {
    field: string[];
    message: string;
}

interface FileCreateUpdateResponse {
    data: {
        fileCreate?: {
            files: Array<{
                id: string;
                alt?: string;
                createdAt: string;
            }>;
            userErrors: UserError[];
        };
        fileUpdate?: {
            files: Array<{
                id: string;
                alt?: string;
                createdAt: string;
            }>;
            userErrors: UserError[];
        };
    };
}

interface StagedUploadTarget {
    url: string;
    resourceUrl: string;
    parameters: Array<{
        name: string;
        value: string;
    }>;
}

interface StagedUploadsCreateResponse {
    data: {
        stagedUploadsCreate: {
            stagedTargets: StagedUploadTarget[];
            userErrors: UserError[];
        };
    };
}

interface FileDeleteResponse {
    data: {
        fileDelete: {
            deletedFileIds: string[];
            userErrors: UserError[];
        };
    };
}

export class ShopifyFiles extends BaseResourceCommand<FileNode, FileMetadata> {
    getResourceName(): string {
        return 'files';
    }

    getFileExtension(): string {
        return ''; // Files don't have a specific extension
    }

    async fetchResources(site: string, accessToken: string): Promise<FileNode[]> {
        const query = `
            query($first: Int!, $after: String) {
                files(first: $first, after: $after) {
                    edges {
                        node {
                            ... on MediaImage {
                                id
                                alt
                                createdAt
                                fileStatus
                                image {
                                    url
                                }
                            }
                            ... on Video {
                                id
                                alt
                                createdAt
                                fileStatus
                                sources {
                                    url
                                }
                            }
                            ... on GenericFile {
                                id
                                alt
                                createdAt
                                fileStatus
                                url
                            }
                        }
                    }
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                }
            }
        `;

        const allFiles: FileNode[] = [];
        let hasNextPage = true;
        let after: string | null = null;
        const perPage = 250;

        while (hasNextPage) {
            const response: { data: FilesQueryResponse['data'] } = await GraphQLClient.request<FilesQueryResponse['data']>(
                site,
                accessToken,
                query,
                { first: perPage, after },
                'files'
            );

            const edges = response.data.files.edges;
            allFiles.push(...edges.map((edge: { node: FileNode }) => edge.node));

            hasNextPage = response.data.files.pageInfo.hasNextPage;
            after = response.data.files.pageInfo.endCursor || null;
        }

        return allFiles;
    }

    getResourceHandle(file: FileNode): string {
        let url = '';

        if ('image' in file && file.image?.url) {
            url = file.image.url;
        } else if ('sources' in file && Array.isArray(file.sources) && file.sources[0]?.url) {
            url = file.sources[0].url;
        } else if ('url' in file && file.url) {
            url = file.url;
        }

        if (!url) {
            const idParts = file.id.split('/');
            return `file-${idParts[idParts.length - 1]}`;
        }

        const urlParts = url.split('/');
        const fileNameWithParams = urlParts[urlParts.length - 1];
        const fileName = fileNameWithParams.split('?')[0];
        return fileName || `file-${file.id}`;
    }

    extractMetadata(file: FileNode): FileMetadata {
        return {
            id: file.id,
            alt: file.alt,
            createdAt: file.createdAt,
            fileStatus: file.fileStatus,
            contentType: this.determineContentType(file)
        };
    }

    async downloadSingleResource(file: FileNode, outputPath: string): Promise<void> {
        let fileUrl = '';

        if ('image' in file && file.image?.url) {
            fileUrl = file.image.url;
        } else if ('sources' in file && Array.isArray(file.sources) && file.sources[0]?.url) {
            fileUrl = file.sources[0].url;
        } else if ('url' in file && file.url) {
            fileUrl = file.url;
        }

        if (!fileUrl) {
            const fileName = this.getResourceHandle(file);
            throw new Error(`Failed to download file '${fileName}' (ID: ${file.id}): No download URL available. The file may still be processing or may have been deleted.`);
        }

        const filePath = this.getResourceFilePath(outputPath, file);

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(fileUrl);

            if (!response.ok) {
                const fileName = this.getResourceHandle(file);
                throw new Error(`Failed to download file '${fileName}' (ID: ${file.id}): Download request failed (${response.status}): ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            IOUtility.ensureDirectoryExists(path.dirname(filePath));

            fs.writeFileSync(filePath, buffer);
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    async uploadSingleResource(
        site: string,
        accessToken: string,
        file: LocalFile<FileMetadata>
    ): Promise<void> {
        const mutation = file.metadata?.id ? `
            mutation fileUpdate($files: [FileUpdateInput!]!) {
                fileUpdate(files: $files) {
                    files {
                        id
                        alt
                        createdAt
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        ` : `
            mutation fileCreate($files: [FileCreateInput!]!) {
                fileCreate(files: $files) {
                    files {
                        id
                        alt
                        createdAt
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const stagedTarget = await this.stageFile(site, accessToken, file.filePath, file.handle);

        const variables = {
            files: [
                {
                    alt: file.metadata?.alt || file.handle,
                    contentType: this.getShopifyContentType(file.handle),
                    originalSource: stagedTarget.resourceUrl
                }
            ]
        };

        const data = await GraphQLClient.mutation<FileCreateUpdateResponse['data']>(
            site,
            accessToken,
            mutation,
            variables,
            'files'
        );

        const result = file.metadata?.id ? data.fileUpdate : data.fileCreate;

        if (result && result.userErrors && result.userErrors.length > 0) {
            throw new Error(`Failed to upload file '${file.handle}'${file.metadata?.id ? ' (update)' : ' (create)'}: ${result.userErrors.map(e => e.message).join(', ')}`);
        }
    }

    async deleteSingleResource(
        site: string,
        accessToken: string,
        file: FileNode
    ): Promise<void> {
        const mutation = `
            mutation fileDelete($fileIds: [ID!]!) {
                fileDelete(fileIds: $fileIds) {
                    deletedFileIds
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const variables = {
            fileIds: [file.id]
        };

        const data = await GraphQLClient.mutation<FileDeleteResponse['data']>(
            site,
            accessToken,
            mutation,
            variables,
            'files'
        );

        if (data.fileDelete.userErrors && data.fileDelete.userErrors.length > 0) {
            const fileName = this.getResourceHandle(file);
            throw new Error(`Failed to delete file '${fileName}' (ID: ${file.id}): ${data.fileDelete.userErrors.map((e: UserError) => e.message).join(', ')}`);
        }
    }

    protected collectLocalFiles(inputPath: string): LocalFile<FileMetadata>[] {
        const files: LocalFile<FileMetadata>[] = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && !entry.name.endsWith('.meta')) {
                const filePath = path.join(inputPath, entry.name);
                const handle = entry.name;
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
        return IOUtility.findFilesToDelete(outputPath, remoteHandles);
    }

    private determineContentType(file: FileNode): 'IMAGE' | 'VIDEO' | 'FILE' {
        if ('image' in file && file.image?.url) return 'IMAGE';
        if ('sources' in file && file.sources) return 'VIDEO';
        return 'FILE';
    }

    private async stageFile(site: string, accessToken: string, filePath: string, fileName: string): Promise<{ resourceUrl: string }> {
        const mutation = `
            mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                stagedUploadsCreate(input: $input) {
                    stagedTargets {
                        url
                        resourceUrl
                        parameters {
                            name
                            value
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }
        `;

        const fileSize = fs.statSync(filePath).size;
        const variables = {
            input: [
                {
                    resource: 'FILE',
                    filename: fileName,
                    mimeType: this.getContentType(fileName),
                    fileSize: fileSize.toString(),
                    httpMethod: 'POST'
                }
            ]
        };

        const data = await GraphQLClient.mutation<StagedUploadsCreateResponse['data']>(
            site,
            accessToken,
            mutation,
            variables,
            'files'
        );

        if (data.stagedUploadsCreate.userErrors.length > 0) {
            throw new Error(`Failed to create staging upload for file '${fileName}': ${data.stagedUploadsCreate.userErrors.map(e => e.message).join(', ')}`);
        }

        const stagedTarget = data.stagedUploadsCreate.stagedTargets[0];

        const fileBuffer = fs.readFileSync(filePath);
        const formData = new FormData();

        stagedTarget.parameters.forEach(param => {
            formData.append(param.name, param.value);
        });

        formData.append('file', new Blob([fileBuffer]), fileName);

        const uploadResponse = await fetch(stagedTarget.url, {
            method: 'POST',
            body: formData as any
        });

        if (!uploadResponse.ok) {
            throw new Error(`Failed to upload file '${fileName}' to staging area: Upload request failed (${uploadResponse.status}): ${uploadResponse.statusText}`);
        }

        return { resourceUrl: stagedTarget.resourceUrl };
    }

    private getContentType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.zip': 'application/zip'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    private getShopifyContentType(fileName: string): 'IMAGE' | 'VIDEO' | 'FILE' {
        const ext = path.extname(fileName).toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
        const videoExtensions = ['.mp4', '.mov', '.avi'];

        if (imageExtensions.includes(ext)) return 'IMAGE';
        if (videoExtensions.includes(ext)) return 'VIDEO';
        return 'FILE';
    }
}

export async function filesPullCommand(options: FilesPullOptions): Promise<void> {
    const files = new ShopifyFiles();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await files.pull({
        output: options.output,
        site: credentials.site,
        accessToken: credentials.accessToken,
        maxItems: options.maxFiles,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}

export async function filesPushCommand(options: FilesPushOptions): Promise<void> {
    const files = new ShopifyFiles();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await files.push({
        input: options.input,
        site: credentials.site,
        accessToken: credentials.accessToken,
        dryRun: options.dryRun,
        mirror: options.mirror
    });
}
