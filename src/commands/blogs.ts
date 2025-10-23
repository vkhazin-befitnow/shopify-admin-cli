import * as fs from 'fs';
import * as path from 'path';
import { HttpClient } from '../utils/http-client';
import { RetryUtility } from '../utils/retry';
import { DryRunManager } from '../utils/dry-run';
import { SHOPIFY_API } from '../settings';
import { CredentialResolver } from '../utils/auth';
import { IOUtility } from '../utils/io';
import { Logger } from '../utils/logger';

type BlogsResourceType = 'blogs';

interface Blog {
    id: number;
    handle: string;
    title: string;
    commentable?: string;
    feedburner?: string;
    feedburner_location?: string;
    created_at: string;
    updated_at: string;
    tags?: string;
    template_suffix?: string;
    admin_graphql_api_id?: string;
}

interface Article {
    id: number;
    title: string;
    handle: string;
    body_html?: string;
    blog_id: number;
    author?: string;
    user_id?: number;
    published_at?: string;
    created_at: string;
    updated_at: string;
    summary_html?: string;
    template_suffix?: string;
    tags?: string;
    admin_graphql_api_id?: string;
    image?: {
        src?: string;
        alt?: string;
    };
}

interface BlogMetadata {
    id: number;
    title: string;
    handle: string;
    created_at: string;
    updated_at: string;
    commentable?: string;
    template_suffix?: string;
    tags?: string;
}

interface ArticleMetadata {
    id: number;
    title: string;
    handle: string;
    blog_id: number;
    author?: string;
    published_at?: string;
    created_at: string;
    updated_at: string;
    template_suffix?: string;
    tags?: string;
}

interface BlogListResult {
    blogs: Blog[];
}

interface ArticleListResult {
    articles: Article[];
}

export interface BlogsPullOptions {
    output: string;
    maxArticles?: number;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export interface BlogsPushOptions {
    input: string;
    dryRun?: boolean;
    mirror?: boolean;
    site: string;
    accessToken: string;
}

export class ShopifyBlogs {
    private static readonly JSON_EXTENSION = '.json';
    private static readonly META_EXTENSION = '.meta';
    private httpClient = new HttpClient();

    async pull(outputPath: string, site: string, accessToken: string, maxArticles?: number, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Pull blogs${mirror ? ' (Mirror Mode)' : ''}`);

        const finalOutputPath = path.join(outputPath, 'blogs');
        dryRunManager.logAction('pull', `blogs to: ${finalOutputPath}`);

        if (dryRunManager.shouldExecute()) {
            IOUtility.ensureDirectoryExists(finalOutputPath);
        }

        const blogs = await this.fetchBlogs(site, accessToken);
        Logger.info(`Found ${blogs.length} blog(s)`);

        const articlesByBlog = new Map<number, Article[]>();
        let totalArticles = 0;

        for (const blog of blogs) {
            const articles = await this.fetchArticles(site, accessToken, blog.id, maxArticles);
            Logger.info(`  ${blog.handle}: ${articles.length} article(s)`);
            articlesByBlog.set(blog.id, articles);
            totalArticles += articles.length;
        }

        Logger.info(`Found ${totalArticles} remote articles to sync`);

        const toDelete: string[] = [];

        if (mirror) {
            const allArticles: Article[] = [];
            articlesByBlog.forEach(articles => allArticles.push(...articles));
            toDelete.push(...this.findLocalFilesToDelete(finalOutputPath, blogs, allArticles));

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} local files will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: totalArticles + blogs.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Blog Articles'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = this.deleteLocalFiles(finalOutputPath, toDelete);
        }

        const downloadResult = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (const blog of blogs) {
            const articles = articlesByBlog.get(blog.id) || [];
            const blogOutputPath = path.join(finalOutputPath, blog.handle);
            IOUtility.ensureDirectoryExists(blogOutputPath);

            await this.saveBlog(blog, blogOutputPath);

            if (articles.length > 0) {
                const result = await this.downloadArticles(articles, blogOutputPath);
                downloadResult.downloaded += result.downloaded;
                downloadResult.failed += result.failed;
                downloadResult.errors.push(...result.errors);
            }
        }

        Logger.success(`Downloaded ${downloadResult.downloaded} blog(s) and article(s)${downloadResult.failed > 0 ? ` (${downloadResult.failed} failed)` : ''}`);
        if (deletedCount > 0) {
            Logger.success(`Deleted ${deletedCount} local file(s) (mirror mode)`);
        }

        if (downloadResult.errors.length > 0) {
            Logger.warn('Some items failed to download:');
            downloadResult.errors.forEach(err => Logger.warn(`  ${err}`));
        }
    }

    async push(inputPath: string, site: string, accessToken: string, dryRun: boolean = false, mirror: boolean = false): Promise<void> {
        const dryRunManager = new DryRunManager(dryRun);
        dryRunManager.logDryRunHeader(`Push blogs${mirror ? ' (Mirror Mode)' : ''}`);

        const finalInputPath = path.join(inputPath, 'blogs');
        dryRunManager.logAction('push', `blogs from: ${finalInputPath}`);

        if (!fs.existsSync(finalInputPath)) {
            throw new Error(`Blogs directory not found: ${finalInputPath}`);
        }

        const localBlogDirs = fs.readdirSync(finalInputPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(finalInputPath, dirent.name));
        const articlesToUpload: Array<{ blogHandle: string; filePath: string; articleHandle: string; metadata?: ArticleMetadata }> = [];
        const blogsToUpload: Array<{ blogHandle: string; filePath: string; metadata?: BlogMetadata }> = [];

        for (const blogDir of localBlogDirs) {
            const blogHandle = path.basename(blogDir);
            const blogMetaPath = path.join(blogDir, `_blog${ShopifyBlogs.META_EXTENSION}`);

            let blogMetadata: BlogMetadata | undefined;
            if (fs.existsSync(blogMetaPath)) {
                const metaContent = fs.readFileSync(blogMetaPath, 'utf8');
                blogMetadata = JSON.parse(metaContent);
                blogsToUpload.push({ blogHandle, filePath: blogMetaPath, metadata: blogMetadata });
            }

            const articleFiles = fs.readdirSync(blogDir, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && dirent.name.endsWith(ShopifyBlogs.JSON_EXTENSION) && !dirent.name.endsWith(ShopifyBlogs.META_EXTENSION))
                .map(dirent => path.join(blogDir, dirent.name));

            for (const articleFile of articleFiles) {
                const articleHandle = path.basename(articleFile, ShopifyBlogs.JSON_EXTENSION);
                const metaPath = articleFile + ShopifyBlogs.META_EXTENSION;

                let metadata: ArticleMetadata | undefined;
                if (fs.existsSync(metaPath)) {
                    const metaContent = fs.readFileSync(metaPath, 'utf8');
                    metadata = JSON.parse(metaContent);
                }

                articlesToUpload.push({ blogHandle, filePath: articleFile, articleHandle, metadata });
            }
        }

        const toDelete: string[] = [];

        if (mirror) {
            const remoteBlogs = await this.fetchBlogs(site, accessToken);

            for (const remoteBlog of remoteBlogs) {
                const remoteArticles = await this.fetchArticles(site, accessToken, remoteBlog.id);
                const localBlogPath = localBlogDirs.find(dir => path.basename(dir) === remoteBlog.handle);

                if (!localBlogPath) {
                    toDelete.push(`blog: ${remoteBlog.handle}`);
                    continue;
                }

                for (const remoteArticle of remoteArticles) {
                    const hasLocal = articlesToUpload.some(
                        a => a.blogHandle === remoteBlog.handle && a.articleHandle === remoteArticle.handle
                    );
                    if (!hasLocal) {
                        toDelete.push(`article: ${remoteBlog.handle}/${remoteArticle.handle}`);
                    }
                }
            }

            if (toDelete.length > 0) {
                Logger.info(`Mirror mode: ${toDelete.length} remote items will be deleted`);
            }
        }

        dryRunManager.logSummary({
            itemsToSync: articlesToUpload.length,
            itemsToDelete: mirror ? toDelete.length : undefined,
            deleteList: toDelete,
            itemType: 'Blog Articles'
        });

        if (!dryRunManager.shouldExecute()) {
            return;
        }

        let deletedCount = 0;
        if (mirror && toDelete.length > 0) {
            deletedCount = await this.deleteRemoteArticles(site, accessToken, toDelete);
        }

        const uploadResult = { uploaded: 0, failed: 0, errors: [] as string[] };

        for (const { blogHandle, filePath, articleHandle, metadata } of articlesToUpload) {
            try {
                await this.uploadSingleArticle(site, accessToken, { blogHandle, filePath, articleHandle, metadata });
                uploadResult.uploaded++;
            } catch (error) {
                uploadResult.failed++;
                const message = error instanceof Error ? error.message : String(error);
                uploadResult.errors.push(`${blogHandle}/${articleHandle}: ${message}`);
            }
        }

        Logger.success(`Uploaded ${uploadResult.uploaded} article(s)${uploadResult.failed > 0 ? ` (${uploadResult.failed} failed)` : ''}`);
        if (deletedCount > 0) {
            Logger.success(`Deleted ${deletedCount} remote article(s) (mirror mode)`);
        }

        if (uploadResult.errors.length > 0) {
            Logger.warn('Some articles failed to upload:');
            uploadResult.errors.forEach(err => Logger.warn(`  ${err}`));
        }
    }

    private async fetchBlogs(site: string, accessToken: string): Promise<Blog[]> {
        let allBlogs: Blog[] = [];
        let url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/blogs.json?limit=250`;

        while (url) {
            const response = await RetryUtility.withRetry(
                () => this.httpClient.request(url, 'GET', {
                    headers: { 'X-Shopify-Access-Token': accessToken },
                    resourceType: 'products',
                    operationContext: 'fetch blogs list'
                }),
                SHOPIFY_API.RETRY_CONFIG
            );

            const result = await response.json();
            allBlogs = allBlogs.concat(result.blogs);

            const linkHeader = response.headers.get('Link');
            url = this.getNextPageUrl(linkHeader || undefined);
        }

        return allBlogs;
    }

    private async fetchArticles(site: string, accessToken: string, blogId: number, maxCount?: number): Promise<Article[]> {
        let allArticles: Article[] = [];
        let url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/blogs/${blogId}/articles.json?limit=250`;

        while (url && (!maxCount || allArticles.length < maxCount)) {
            const response = await RetryUtility.withRetry(
                () => this.httpClient.request(url, 'GET', {
                    headers: { 'X-Shopify-Access-Token': accessToken },
                    resourceType: 'products',
                    operationContext: 'fetch articles list'
                }),
                SHOPIFY_API.RETRY_CONFIG
            );

            const result = await response.json();
            allArticles = allArticles.concat(result.articles);

            if (maxCount && allArticles.length >= maxCount) {
                allArticles = allArticles.slice(0, maxCount);
                break;
            }

            const linkHeader = response.headers.get('Link');
            url = this.getNextPageUrl(linkHeader || undefined);
        }

        return allArticles;
    }

    private getNextPageUrl(linkHeader?: string): string {
        if (!linkHeader) return '';

        const links = linkHeader.split(',');
        for (const link of links) {
            const match = link.match(/<([^>]+)>;\s*rel="next"/);
            if (match) {
                return match[1];
            }
        }
        return '';
    }

    private async saveBlog(blog: Blog, outputPath: string): Promise<void> {
        const metadata: BlogMetadata = {
            id: blog.id,
            title: blog.title,
            handle: blog.handle,
            created_at: blog.created_at,
            updated_at: blog.updated_at,
            commentable: blog.commentable,
            template_suffix: blog.template_suffix,
            tags: blog.tags
        };

        const metaPath = path.join(outputPath, `_blog${ShopifyBlogs.META_EXTENSION}`);
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    }

    private async downloadArticles(articles: Article[], outputPath: string): Promise<{ downloaded: number; failed: number; errors: string[] }> {
        const result = { downloaded: 0, failed: 0, errors: [] as string[] };

        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            Logger.progress(i + 1, articles.length, `Downloading ${article.handle}`);

            try {
                const metadata: ArticleMetadata = {
                    id: article.id,
                    title: article.title,
                    handle: article.handle,
                    blog_id: article.blog_id,
                    author: article.author,
                    published_at: article.published_at,
                    created_at: article.created_at,
                    updated_at: article.updated_at,
                    template_suffix: article.template_suffix,
                    tags: article.tags
                };

                const articleContent = {
                    body_html: article.body_html || '',
                    summary_html: article.summary_html,
                    image: article.image
                };

                const filePath = path.join(outputPath, `${article.handle}${ShopifyBlogs.JSON_EXTENSION}`);
                const metaPath = filePath + ShopifyBlogs.META_EXTENSION;

                fs.writeFileSync(filePath, JSON.stringify(articleContent, null, 2));
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

                result.downloaded++;
            } catch (error) {
                result.failed++;
                const message = error instanceof Error ? error.message : String(error);
                result.errors.push(`${article.handle}: ${message}`);
            }
        }

        return result;
    }

    private findLocalFilesToDelete(outputPath: string, blogs: Blog[], allArticles: Article[]): string[] {
        const toDelete: string[] = [];

        if (!fs.existsSync(outputPath)) {
            return toDelete;
        }

        const localBlogDirs = fs.readdirSync(outputPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(outputPath, dirent.name));

        for (const localBlogDir of localBlogDirs) {
            const blogHandle = path.basename(localBlogDir);
            const remoteBlog = blogs.find(b => b.handle === blogHandle);

            if (!remoteBlog) {
                const relativePath = path.relative(outputPath, localBlogDir);
                toDelete.push(`blog: ${relativePath}`);
                continue;
            }

            const localArticleFiles = fs.readdirSync(localBlogDir, { withFileTypes: true })
                .filter(dirent => dirent.isFile() && dirent.name.endsWith(ShopifyBlogs.JSON_EXTENSION) && !dirent.name.endsWith(ShopifyBlogs.META_EXTENSION))
                .map(dirent => path.join(localBlogDir, dirent.name));

            for (const localFile of localArticleFiles) {
                const articleHandle = path.basename(localFile, ShopifyBlogs.JSON_EXTENSION);
                const remoteArticle = allArticles.find(a => a.blog_id === remoteBlog.id && a.handle === articleHandle);

                if (!remoteArticle) {
                    const relativePath = path.relative(outputPath, localFile);
                    toDelete.push(`article: ${relativePath}`);

                    const metaPath = localFile + ShopifyBlogs.META_EXTENSION;
                    if (fs.existsSync(metaPath)) {
                        const relativeMetaPath = path.relative(outputPath, metaPath);
                        toDelete.push(`meta: ${relativeMetaPath}`);
                    }
                }
            }
        }

        return toDelete;
    }

    private deleteLocalFiles(outputPath: string, filesToDelete: string[]): number {
        let deletedCount = 0;

        for (const file of filesToDelete) {
            const fullPath = path.join(outputPath, file.replace(/^(blog|article|meta): /, ''));

            try {
                if (fs.existsSync(fullPath)) {
                    if (fs.lstatSync(fullPath).isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(fullPath);
                    }
                    deletedCount++;
                }
            } catch (error) {
                Logger.warn(`Failed to delete ${fullPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return deletedCount;
    }

    private async uploadSingleArticle(
        site: string,
        accessToken: string,
        file: { blogHandle: string; filePath: string; articleHandle: string; metadata?: ArticleMetadata }
    ): Promise<void> {
        const articleJson = fs.readFileSync(file.filePath, 'utf8');
        const articleContent = JSON.parse(articleJson);

        const remoteBlog = await this.findBlogByHandle(site, accessToken, file.blogHandle);
        if (!remoteBlog) {
            throw new Error(`Blog not found: ${file.blogHandle}`);
        }

        const articleData: any = {
            title: file.metadata?.title || file.articleHandle,
            handle: file.articleHandle,
            body_html: articleContent.body_html || '',
        };

        if (articleContent.summary_html !== undefined) {
            articleData.summary_html = articleContent.summary_html;
        }
        if (articleContent.image) {
            articleData.image = articleContent.image;
        }
        if (file.metadata) {
            if (file.metadata.author) articleData.author = file.metadata.author;
            if (file.metadata.published_at) articleData.published_at = file.metadata.published_at;
            if (file.metadata.template_suffix) articleData.template_suffix = file.metadata.template_suffix;
            if (file.metadata.tags) articleData.tags = file.metadata.tags;
        }

        const articleId = file.metadata?.id;
        const url = articleId
            ? `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/blogs/${remoteBlog.id}/articles/${articleId}.json`
            : `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/blogs/${remoteBlog.id}/articles.json`;

        const method = articleId ? 'PUT' : 'POST';
        const payload = { article: articleData };

        await RetryUtility.withRetry(
            () => this.httpClient.request(url, method, {
                headers: { 'X-Shopify-Access-Token': accessToken },
                body: payload,
                resourceType: 'products',
                operationContext: `${method === 'PUT' ? 'update' : 'create'} article`
            }),
            SHOPIFY_API.RETRY_CONFIG
        );
    }

    private async findBlogByHandle(site: string, accessToken: string, handle: string): Promise<Blog | null> {
        const blogs = await this.fetchBlogs(site, accessToken);
        return blogs.find(b => b.handle === handle) || null;
    }

    private async deleteRemoteArticles(site: string, accessToken: string, toDelete: string[]): Promise<number> {
        let deletedCount = 0;

        for (const item of toDelete) {
            if (item.startsWith('article: ')) {
                const [blogHandle, articleHandle] = item.replace('article: ', '').split('/');

                try {
                    const remoteBlog = await this.findBlogByHandle(site, accessToken, blogHandle);
                    if (!remoteBlog) continue;

                    const articles = await this.fetchArticles(site, accessToken, remoteBlog.id);
                    const article = articles.find(a => a.handle === articleHandle);

                    if (article) {
                        const url = `${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/blogs/${remoteBlog.id}/articles/${article.id}.json`;
                        await RetryUtility.withRetry(
                            () => this.httpClient.request(url, 'DELETE', {
                                headers: { 'X-Shopify-Access-Token': accessToken },
                                resourceType: 'products',
                                operationContext: 'delete article'
                            }),
                            SHOPIFY_API.RETRY_CONFIG
                        );
                        deletedCount++;
                    }
                } catch (error) {
                    Logger.warn(`Failed to delete article ${blogHandle}/${articleHandle}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        }

        return deletedCount;
    }
}

export async function blogsPullCommand(options: BlogsPullOptions): Promise<void> {
    const blogs = new ShopifyBlogs();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['output']);

    await blogs.pull(
        options.output,
        credentials.site,
        credentials.accessToken,
        options.maxArticles,
        options.dryRun,
        options.mirror
    );
}

export async function blogsPushCommand(options: BlogsPushOptions): Promise<void> {
    const blogs = new ShopifyBlogs();
    const credentials = CredentialResolver.resolve(options);
    CredentialResolver.validateRequiredOptions(options, ['input']);

    await blogs.push(
        options.input,
        credentials.site,
        credentials.accessToken,
        options.dryRun,
        options.mirror
    );
}
