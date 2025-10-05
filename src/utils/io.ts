import * as fs from 'fs';
import * as path from 'path';

export class IOUtility {
    /**
     * Builds a resource path following the standard structure:
     * root/files, root/pages, root/menus, or root/themes/theme-name
     */
    static buildResourcePath(
        root: string,
        resource: 'files' | 'pages' | 'menus' | 'themes',
        themeName?: string
    ): string {
        return themeName
            ? path.join(root, resource, themeName)
            : path.join(root, resource);
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
}
