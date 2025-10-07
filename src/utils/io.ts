import * as fs from 'fs';
import * as path from 'path';

export class IOUtility {
    /**
     * Builds a resource path following the standard structure:
     * root/files, root/pages, root/menus, root/metaobjects, or root/themes/theme-name
     */
    static buildResourcePath(
        root: string,
        resource: 'files' | 'pages' | 'menus' | 'metaobjects' | 'products' | 'themes',
        themeName?: string
    ): string {
        return themeName
            ? path.join(root, resource, themeName)
            : path.join(root, resource);
    }

    /**
     * Resolves and prepares a resource directory path with automatic creation
     * @param basePath The base path where the resource directory should be created
     * @param resource The resource type (files, pages, menus, metaobjects, themes)
     * @param themeName Optional theme name for themes resource
     * @param createDirectory Whether to create the directory if it doesn't exist (default: true)
     * @returns The resolved absolute path to the resource directory
     */
    static prepareResourcePath(
        basePath: string,
        resource: 'files' | 'pages' | 'menus' | 'metaobjects' | 'products' | 'themes',
        themeName?: string,
        createDirectory: boolean = true
    ): string {
        const resourcePath = this.buildResourcePath(basePath, resource, themeName);
        const resolvedPath = path.resolve(resourcePath);

        if (createDirectory) {
            this.ensureDirectoryExists(resolvedPath);
        }

        return resolvedPath;
    }

    /**
     * Validates that a path exists and is a directory
     * @param inputPath The path to validate
     * @returns The resolved absolute path
     * @throws Error if path doesn't exist or is not a directory
     */
    static validateDirectoryPath(inputPath: string): string {
        const resolvedPath = path.resolve(inputPath);

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Directory does not exist: ${resolvedPath}`);
        }

        const stats = fs.statSync(resolvedPath);
        if (!stats.isDirectory()) {
            throw new Error(`Path is not a directory: ${resolvedPath}`);
        }

        return resolvedPath;
    }

    /**
     * Ensures a directory exists, creating it recursively if needed
     */
    static ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Recursively walks through a directory and calls callback for each file
     */
    static walkDirectory(
        basePath: string,
        callback: (filePath: string, relativePath: string) => void
    ): void {
        if (!fs.existsSync(basePath)) return;

        const walk = (dir: string) => {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);

                if (stat.isDirectory()) {
                    walk(itemPath);
                } else if (stat.isFile()) {
                    const relativePath = path.relative(basePath, itemPath);
                    const normalizedPath = relativePath.replace(/\\/g, '/');
                    callback(itemPath, normalizedPath);
                }
            });
        };

        walk(basePath);
    }

    /**
     * Check if a file is a binary file based on extension
     */
    static isBinaryFile(filePath: string): boolean {
        const binaryExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
            '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip',
            '.mp4', '.webm', '.mp3', '.wav', '.webp'
        ];
        const ext = path.extname(filePath).toLowerCase();
        return binaryExtensions.includes(ext);
    }

    /**
     * Find local files that should be deleted based on remote files
     * @param outputPath The directory to scan for local files
     * @param remoteFiles Set of remote file names to compare against
     * @param options Configuration options for filtering
     * @returns Array of file names (relative to outputPath) that should be deleted (includes .meta files when applicable)
     */
    static findFilesToDelete(
        outputPath: string,
        remoteFiles: Set<string>,
        options?: {
            fileExtension?: string;
            includeMetaFiles?: boolean;
            recursive?: boolean;
        }
    ): string[] {
        const toDelete: string[] = [];
        const fileExtension = options?.fileExtension;
        const includeMetaFiles = options?.includeMetaFiles ?? false;
        const recursive = options?.recursive ?? false;

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        if (recursive) {
            this.walkDirectory(outputPath, (filePath, relativePath) => {
                if (!remoteFiles.has(relativePath)) {
                    toDelete.push(relativePath);
                }
            });
        } else {
            const files = fs.readdirSync(outputPath, { withFileTypes: true });

            files.forEach(file => {
                if (file.isFile()) {
                    if (fileExtension && !file.name.endsWith(fileExtension)) {
                        return;
                    }

                    if (file.name.endsWith('.meta')) {
                        return;
                    }

                    if (!remoteFiles.has(file.name)) {
                        toDelete.push(file.name);

                        if (includeMetaFiles) {
                            const metaFile = `${file.name}.meta`;
                            if (files.some(f => f.name === metaFile)) {
                                toDelete.push(metaFile);
                            }
                        }
                    }
                }
            });
        }

        return toDelete;
    }

    /**
     * Delete local files from a directory
     * @param outputPath The directory containing files to delete
     * @param filesToDelete Array of file names (relative to outputPath) to delete
     * @param onError Optional callback for handling errors
     * @returns Number of files successfully deleted (including .meta files)
     */
    static deleteLocalFiles(
        outputPath: string,
        filesToDelete: string[],
        onError?: (fileName: string, error: string) => void
    ): number {
        let deletedCount = 0;

        filesToDelete.forEach(file => {
            const filePath = path.join(outputPath, file);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }

                if (!file.endsWith('.meta')) {
                    const metaPath = `${filePath}.meta`;
                    if (fs.existsSync(metaPath)) {
                        fs.unlinkSync(metaPath);
                        deletedCount++;
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (onError) {
                    onError(file, message);
                }
            }
        });

        return deletedCount;
    }
}
