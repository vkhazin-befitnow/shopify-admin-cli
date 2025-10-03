import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { getCredentialsFromEnv } from '../utils/auth';
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

interface GraphQLVariables {
    [key: string]: unknown;
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

export class ShopifyFiles {
    constructor() { }

    async pull(outputPath: string, site: string, accessToken: string, maxFiles?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull files${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = this.prepareOutputDirectory(outputPath);
        console.log(`${dryRun ? 'Would pull' : 'Pulling'} files to: ${finalOutputPath}`);

        let files = await this.fetchFiles(site, accessToken, maxFiles);

        console.log(`Found ${files.length} remote files to sync`);

        const toDelete: string[] = [];

        if (mirror) {
            const remoteFileNames = new Set(files.map(file => this.getFileName(file)));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, remoteFileNames));
            
            if (toDelete.length > 0) {
                console.log(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        if (dryRun) {
            console.log('\nDRY RUN SUMMARY:');
            console.log(`Files to sync: ${files.length}`);
            if (mirror && toDelete.length > 0) {
                console.log(`Local files to delete: ${toDelete.length}`);
                toDelete.slice(0, 10).forEach((file: string) => console.log(`  - ${file}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        if (mirror && toDelete.length > 0) {
            this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        if (files.length > 0) {
            await this.downloadFiles(files, finalOutputPath);
        } else {
            console.log('No files to sync');
        }

        console.log(`Successfully pulled files to ${finalOutputPath}`);
    }

    async push(inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push files${mirror ? ' (Mirror Mode)' : ''}`);

        const filesPath = this.resolveFilesPath(inputPath);
        console.log(`${dryRun ? 'Would push' : 'Pushing'} local files from "${filesPath}"`);

        const localFiles = this.collectLocalFiles(filesPath);

        const remoteFiles = await this.fetchFiles(site, accessToken);

        const toDelete: Array<{ fileName: string, file: FileNode }> = [];

        if (mirror) {
            const localFileMap = new Map<string, { fileName: string, filePath: string }>();
            localFiles.forEach(file => localFileMap.set(file.fileName, file));

            const remoteFileMap = new Map<string, FileNode>();
            remoteFiles.forEach(file => remoteFileMap.set(this.getFileName(file), file));

            remoteFiles.forEach(remoteFile => {
                const fileName = this.getFileName(remoteFile);
                if (!localFileMap.has(fileName)) {
                    toDelete.push({ fileName, file: remoteFile });
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
                toDelete.slice(0, 10).forEach(item => console.log(`  - ${item.fileName}`));
                if (toDelete.length > 10) {
                    console.log(`  ... and ${toDelete.length - 10} more files`);
                }
            }
            return;
        }

        if (localFiles.length > 0) {
            await this.uploadFiles(site, accessToken, localFiles);
        } else {
            console.log('No files to upload');
        }

        if (mirror && toDelete.length > 0) {
            await this.deleteFiles(site, accessToken, toDelete.map(item => item.file));
        }

        console.log('Successfully pushed files');
    }

    private async fetchFiles(site: string, accessToken: string, maxFiles?: number): Promise<FileNode[]> {
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
        const perPage = maxFiles && maxFiles < 250 ? maxFiles : 250;

        while (hasNextPage && (!maxFiles || allFiles.length < maxFiles)) {
            const response: FilesQueryResponse = await this.graphqlRequest<FilesQueryResponse>(site, accessToken, query, {
                first: perPage,
                after
            });

            if (response.errors) {
                throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
            }

            const edges = response.data.files.edges;
            allFiles.push(...edges.map((edge: { node: FileNode }) => edge.node));

            hasNextPage = response.data.files.pageInfo.hasNextPage;
            after = response.data.files.pageInfo.endCursor || null;

            if (maxFiles && allFiles.length >= maxFiles) {
                break;
            }
        }

        return maxFiles ? allFiles.slice(0, maxFiles) : allFiles;
    }

    private async graphqlRequest<T>(site: string, accessToken: string, query: string, variables?: GraphQLVariables): Promise<T> {
        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`;

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-Shopify-Access-Token': accessToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, variables })
            });

            if (response.status === 401) {
                throw new Error('Unauthorized: invalid token or store domain');
            }

            if (response.status === 403) {
                throw new Error('Forbidden: missing required permissions. Ensure your app has read_files scope');
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${errorText}`);
            }

            return await response.json();
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private prepareOutputDirectory(outputPath: string): string {
        const filesPath = IOUtility.buildResourcePath(outputPath, 'files');
        IOUtility.ensureDirectoryExists(filesPath);
        return filesPath;
    }

    private getFileName(file: FileNode): string {
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

    private getFileLocalPath(outputPath: string, file: FileNode): string {
        return path.join(outputPath, this.getFileName(file));
    }

    private findLocalFilesToDelete(outputPath: string, remoteFileNames: Set<string>): string[] {
        const toDelete: string[] = [];

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        const files = fs.readdirSync(outputPath, { withFileTypes: true });

        files.forEach(file => {
            if (file.isFile() && !file.name.endsWith('.meta')) {
                if (!remoteFileNames.has(file.name)) {
                    toDelete.push(file.name);
                }
            }
        });

        return toDelete;
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): void {
        filesToDelete.forEach(file => {
            const filePath = path.join(outputPath, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`Deleted local file: ${file}`);
                
                const metaPath = `${filePath}.meta`;
                if (fs.existsSync(metaPath)) {
                    fs.unlinkSync(metaPath);
                    console.log(`Deleted metadata: ${file}.meta`);
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete ${file}: ${message}`);
            }
        });
    }

    private async downloadFiles(files: FileNode[], outputPath: string): Promise<void> {
        const rateLimitedDownload = RetryUtility.rateLimited(
            (file: FileNode) => this.downloadSingleFile(file, outputPath),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = this.getFileName(file);
            console.log(`Downloading (${i + 1}/${files.length}): ${fileName}`);

            try {
                await rateLimitedDownload(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to download ${fileName}: ${message}`);
            }
        }
    }

    private async downloadSingleFile(file: FileNode, outputPath: string): Promise<void> {
        let fileUrl = '';
        
        if ('image' in file && file.image?.url) {
            fileUrl = file.image.url;
        } else if ('sources' in file && Array.isArray(file.sources) && file.sources[0]?.url) {
            fileUrl = file.sources[0].url;
        } else if ('url' in file && file.url) {
            fileUrl = file.url;
        }
        
        if (!fileUrl) {
            throw new Error(`No URL available for file ID ${file.id}`);
        }

        const filePath = this.getFileLocalPath(outputPath, file);

        return await RetryUtility.withRetry(async () => {
            const response = await fetch(fileUrl);

            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            fs.writeFileSync(filePath, buffer);

            const metadata: FileMetadata = {
                id: file.id,
                alt: file.alt,
                createdAt: file.createdAt,
                fileStatus: file.fileStatus,
                contentType: this.determineContentType(file)
            };
            const metaPath = `${filePath}.meta`;
            fs.writeFileSync(metaPath, yaml.dump(metadata), 'utf8');
        }, SHOPIFY_API.RETRY_CONFIG);
    }

    private determineContentType(file: FileNode): 'IMAGE' | 'VIDEO' | 'FILE' {
        if ('image' in file && file.image?.url) return 'IMAGE';
        if ('sources' in file && file.sources) return 'VIDEO';
        return 'FILE';
    }

    private resolveFilesPath(basePath: string): string {
        const filesPath = IOUtility.buildResourcePath(basePath, 'files');
        
        if (!fs.existsSync(filesPath)) {
            throw new Error(
                `Files directory not found: ${filesPath}\n` +
                `Expected structure: ${basePath}/files/`
            );
        }

        const entries = fs.readdirSync(filesPath);
        const hasFiles = entries.some(entry => {
            const entryPath = path.join(filesPath, entry);
            return fs.statSync(entryPath).isFile();
        });

        if (!hasFiles) {
            throw new Error(`No files found in directory: ${filesPath}`);
        }

        return filesPath;
    }

    private collectLocalFiles(inputPath: string): Array<{ fileName: string, filePath: string, metadata?: FileMetadata }> {
        const files: Array<{ fileName: string, filePath: string, metadata?: FileMetadata }> = [];

        if (!fs.existsSync(inputPath)) {
            return files;
        }

        const entries = fs.readdirSync(inputPath, { withFileTypes: true });

        entries.forEach(entry => {
            if (entry.isFile() && !entry.name.endsWith('.meta')) {
                const filePath = path.join(inputPath, entry.name);
                const metaPath = `${filePath}.meta`;
                
                let metadata: FileMetadata | undefined;
                if (fs.existsSync(metaPath)) {
                    try {
                        const metaContent = fs.readFileSync(metaPath, 'utf8');
                        metadata = yaml.load(metaContent) as FileMetadata;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        console.warn(`Failed to read metadata for ${entry.name}: ${message}`);
                    }
                }
                
                files.push({ fileName: entry.name, filePath, metadata });
            }
        });

        return files;
    }

    private async uploadFiles(site: string, accessToken: string, files: Array<{ fileName: string, filePath: string, fileId?: string, metadata?: FileMetadata }>): Promise<void> {
        const rateLimitedUpload = RetryUtility.rateLimited(
            (file: { fileName: string, filePath: string, fileId?: string, metadata?: FileMetadata }) => this.uploadSingleFile(site, accessToken, file),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`Uploading (${i + 1}/${files.length}): ${file.fileName}`);

            try {
                await rateLimitedUpload(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to upload ${file.fileName}: ${message}`);
            }
        }
    }

    private async uploadSingleFile(site: string, accessToken: string, file: { fileName: string, filePath: string, fileId?: string, metadata?: FileMetadata }): Promise<void> {
        const mutation = file.fileId ? `
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

        const stagedTarget = await this.stageFile(site, accessToken, file.filePath, file.fileName);

        const variables = {
            files: [
                {
                    alt: file.metadata?.alt || file.fileName,
                    contentType: this.getShopifyContentType(file.fileName),
                    originalSource: stagedTarget.resourceUrl
                }
            ]
        };

        const response = await this.graphqlRequest<FileCreateUpdateResponse>(site, accessToken, mutation, variables);

        const result = file.fileId ? response.data.fileUpdate : response.data.fileCreate;
        
        if (result && result.userErrors && result.userErrors.length > 0) {
            throw new Error(`Upload failed: ${result.userErrors.map(e => e.message).join(', ')}`);
        }
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

        const response = await this.graphqlRequest<StagedUploadsCreateResponse>(site, accessToken, mutation, variables);

        if (response.data.stagedUploadsCreate.userErrors.length > 0) {
            throw new Error(`Staging failed: ${response.data.stagedUploadsCreate.userErrors.map(e => e.message).join(', ')}`);
        }

        const stagedTarget = response.data.stagedUploadsCreate.stagedTargets[0];

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
            throw new Error(`Failed to upload to staging: ${uploadResponse.status} ${uploadResponse.statusText}`);
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

    private async deleteFiles(site: string, accessToken: string, files: FileNode[]): Promise<void> {
        const rateLimitedDelete = RetryUtility.rateLimited(
            (file: FileNode) => this.deleteSingleFile(site, accessToken, file),
            RetryUtility.RATE_LIMITS.SHOPIFY_API
        );

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = this.getFileName(file);
            console.log(`Deleting (${i + 1}/${files.length}): ${fileName}`);

            try {
                await rateLimitedDelete(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`Failed to delete ${fileName}: ${message}`);
            }
        }
    }

    private async deleteSingleFile(site: string, accessToken: string, file: FileNode): Promise<void> {
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

        const response = await this.graphqlRequest<FileDeleteResponse>(site, accessToken, mutation, variables);

        if (response.data.fileDelete.userErrors && response.data.fileDelete.userErrors.length > 0) {
            throw new Error(`Delete failed: ${response.data.fileDelete.userErrors.map(e => e.message).join(', ')}`);
        }
    }
}

export async function filesPullCommand(options: FilesPullOptions): Promise<void> {
    const files = new ShopifyFiles();
    const credentials = getCredentialsFromEnv();

    let finalSite = options.site;
    let finalAccessToken = options.accessToken;

    if (!finalSite || !finalAccessToken) {
        if (credentials) {
            finalSite = finalSite || credentials.site;
            finalAccessToken = finalAccessToken || credentials.accessToken;
        }
    }

    if (!finalSite || !finalAccessToken) {
        throw new Error('Missing credentials. Provide either:\n' +
            '1. CLI arguments: --site <domain> --access-token <token>\n' +
            '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    if (!options.output) {
        throw new Error('Output path is required. Use --output <path>');
    }

    await files.pull(
        options.output,
        finalSite,
        finalAccessToken,
        options.maxFiles,
        options.dryRun,
        options.mirror
    );
}

export async function filesPushCommand(options: FilesPushOptions): Promise<void> {
    const files = new ShopifyFiles();
    const credentials = getCredentialsFromEnv();

    let finalSite = options.site;
    let finalAccessToken = options.accessToken;

    if (!finalSite || !finalAccessToken) {
        if (credentials) {
            finalSite = finalSite || credentials.site;
            finalAccessToken = finalAccessToken || credentials.accessToken;
        }
    }

    if (!finalSite || !finalAccessToken) {
        throw new Error('Missing credentials. Provide either:\n' +
            '1. CLI arguments: --site <domain> --access-token <token>\n' +
            '2. Environment variables: SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN');
    }

    if (!options.input) {
        throw new Error('Input path is required. Use --input <path>');
    }

    await files.push(
        options.input,
        finalSite,
        finalAccessToken,
        options.dryRun,
        options.mirror
    );
}
