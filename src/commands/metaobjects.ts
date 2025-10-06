import * as fs from 'fs'; import * as fs from 'fs'; import * as fs from 'fs';

import * as path from 'path';

import * as yaml from 'js-yaml'; import * as path from 'path'; import * as path from 'path';

import { RetryUtility } from '../utils/retry';

import { DryRunManager } from '../utils/dry-run'; import * as yaml from 'js-yaml'; import * as yaml from 'js-yaml';

import { SHOPIFY_API } from '../settings';

import { CredentialResolver } from '../utils/auth'; import { RetryUtility } from '../utils/retry'; import { RetryUtility } from '../utils/retry';

import { IOUtility } from '../utils/io';

import { Logger } from '../utils/logger'; import { DryRunManager } from '../utils/dry-run'; import { DryRunManager } from '../utils/dry-run';



interface MetaobjectField {import { SHOPIFY_API } from '../settings'; import { SHOPIFY_API } from '../sett            const query = `

key: string;

value: string; import { CredentialResolver } from '../utils/auth';                query GetMetaobjects($type: String!, $first: Int) {

    type ?: string;

} import { IOUtility } from '../utils/io'; metaobjects(type: $type, first: $first) {



    interface Metaobject {import { Logger } from '../utils/logger';                        nodes {

        id: string;

        handle: string; id

        type: string;

        displayName ?: string; interface MetaobjectField {
            handle

            updatedAt?: string;

            fields: MetaobjectField[]; key: string; type

        }

        value: string; displayName

        interface MetaobjectOptions {

            type?: string; type?: string; updatedAt

            outputPath?: string;

            inputPath?: string;
        }                            fields {

            dryRun ?: boolean;

            mirror ?: boolean; key

        }

        interface Metaobject { value

interface MetaobjectMetadata {

            id: string; id: string; type

            handle: string;

            type: string; handle: string;
        }

        displayName ?: string;

        updatedAt ?: string; type: string;
    }

}

displayName ?: string;                    }

/**

 * Shopify Metaobjects management commands    updatedAt?: string;                }`;edentialResolver } from '../utils/auth';

 */

export class ShopifyMetaobjects { fields: MetaobjectField[];import { IOUtility } from '../utils/io';

    private static readonly JSON_EXTENSION = '.json';

    private static readonly META_EXTENSION = '.json.meta';}import { Logger } from '../utils/logger';

    private static readonly DEFAULT_OUTPUT_DIR = 'metaobjects';



    /**

     * Pull metaobjects from Shopifyinterface MetaobjectOptions {interface MetaobjectField {

     */

    static async pull(options: MetaobjectOptions = {}): Promise < void> {
    type?: string; key: string;

    const dryRunManager = new DryRunManager(options.dryRun);

    const { site, accessToken } = await CredentialResolver.resolve(); outputPath?: string; value: string;

    const outputPath = await IOUtility.prepareResourcePath('metaobjects', options.outputPath);

    inputPath?: string; type?: string;

    dryRunManager.logDryRunHeader(`Pull metaobjects${options.mirror ? ' (Mirror Mode)' : ''}`);

    Logger.info(`Site: ${site} | Output: ${outputPath}${options.type ? ` | Type: ${options.type}` : ''}`); dryRun?: boolean;
}



dryRunManager.logAction('pull', `metaobjects${options.type ? ` of type "${options.type}"` : ''} to: ${outputPath}`); mirror ?: boolean;



if (dryRunManager.isDryRun) { } interface Metaobject {

            Logger.info('Dry run completed - no files were modified');

return; id: string;

        }

interface MetaobjectMetadata { handle: string;

        // Prepare directory

        await IOUtility.validateDirectoryPath(outputPath); id: string; type: string;



let totalDownloaded = 0; handle: string; displayName: string;

const typesToProcess = options.type ? [options.type] : await this.getMetaobjectTypes(site, accessToken);

type: string; fields: MetaobjectField[];

if (options.mirror) {

    // Mirror mode: Clear directory first    displayName?: string;    createdAt?: string;

    Logger.info('Mirror mode: clearing existing metaobjects');

    for (const file of fs.readdirSync(outputPath)) {
        updatedAt ?: string; updatedAt ?: string;

        if (file.endsWith(this.JSON_EXTENSION) || file.endsWith(this.META_EXTENSION)) {

            fs.unlinkSync(path.join(outputPath, file));
        }
    }

}

            }

        }

/**interface MetaobjectMetadata {

        // Process each type

        for (const type of typesToProcess) { * Shopify Metaobjects management commands    id: string;

            Logger.info(`Processing metaobjects of type: ${type}`);

            const metaobjects = await this.fetchMetaobjects(site, accessToken, type); */    handle: string;



if (metaobjects.length > 0) {
    export class ShopifyMetaobjects { type: string;

                await this.downloadMetaobjects(metaobjects, outputPath);

    totalDownloaded += metaobjects.length;    private static readonly JSON_EXTENSION = '.json'; displayName: string;

} else {

    Logger.info(`No metaobjects found for type: ${type}`);    private static readonly META_EXTENSION = '.json.meta'; createdAt ?: string;

}

        }    private static readonly DEFAULT_OUTPUT_DIR = 'metaobjects'; updatedAt ?: string;



const typeInfo = options.type ? ` of type "${options.type}"` : '';}

Logger.success(`Successfully pulled metaobjects${typeInfo} to ${outputPath} | Downloaded: ${totalDownloaded}`);

    }    /**



    /**     * Pull metaobjects from Shopifyexport interface MetaobjectsPullOptions {

     * Push metaobjects to Shopify

     */     */    output: string;

    static async push(options: MetaobjectOptions = {}): Promise < void> {

    if(!options.type) {    static async pull(options: MetaobjectOptions = {}): Promise < void> {
        type?: string; // Filter by metaobject type

        throw new Error('Type parameter is required for pushing metaobjects. Use --type parameter to specify the metaobject type.');

    }        const dryRunManager = new DryRunManager(options.dryRun); maxMetaobjects ?: number;



    const dryRunManager = new DryRunManager(options.dryRun); const { site, accessToken } = await CredentialResolver.resolve(); dryRun ?: boolean;

    const { site, accessToken } = await CredentialResolver.resolve();

    const inputPath = await IOUtility.prepareResourcePath('metaobjects', options.inputPath); const outputPath = await IOUtility.prepareResourcePath('metaobjects', options.outputPath); mirror ?: boolean;



    dryRunManager.logDryRunHeader(`Push metaobjects${options.mirror ? ' (Mirror Mode)' : ''}`); site: string;

    Logger.info(`Site: ${site} | Input: ${inputPath} | Type: ${options.type}`);

    dryRunManager.logDryRunHeader(`Pull metaobjects${options.mirror ? ' (Mirror Mode)' : ''}`); accessToken: string;

    dryRunManager.logAction('push', `metaobjects of type "${options.type}" from: ${inputPath}`);

    Logger.info(`Site: ${site} | Output: ${outputPath}${options.type ? ` | Type: ${options.type}` : ''}`);
}

if (dryRunManager.isDryRun) {

    Logger.info('Dry run completed - no changes were made to Shopify');

    return;

} dryRunManager.logAction('pull', `metaobjects${options.type ? ` of type "${options.type}"` : ''} to: ${outputPath}`); export interface MetaobjectsPushOptions {



        await IOUtility.validateDirectoryPath(inputPath); input: string;



if (options.mirror) {
    if (dryRunManager.isDryRun) {
        type ?: string; // Required for push to specify which type to upload

        // Mirror mode: Delete all remote metaobjects of this type first

        Logger.info(`Mirror mode: deleting all remote metaobjects of type "${options.type}"`); Logger.info('Dry run completed - no files were modified'); dryRun ?: boolean;

        const existingMetaobjects = await this.fetchMetaobjects(site, accessToken, options.type);

        for (const metaobject of existingMetaobjects) {
            return; mirror ?: boolean;

            await this.deleteMetaobject(site, accessToken, metaobject.id);

            Logger.info(`Deleted metaobject: ${metaobject.handle}`);
        } site: string;

    }

} accessToken: string;



// Get all JSON files for this type        // Prepare directory}

const files = fs.readdirSync(inputPath)

    .filter(file => file.endsWith(this.JSON_EXTENSION))        await IOUtility.validateDirectoryPath(outputPath);

            .filter(file => {

        const metaFilePath = path.join(inputPath, file + '.meta'); export class ShopifyMetaobjects {

            if(fs.existsSync(metaFilePath)) {

    try {
        let totalDownloaded = 0;    private static readonly JSON_EXTENSION = '.json';

        const metadata = yaml.load(fs.readFileSync(metaFilePath, 'utf8')) as MetaobjectMetadata;

        return metadata.type === options.type; const typesToProcess = options.type ? [options.type] : await this.getMetaobjectTypes(site, accessToken);    private static readonly META_EXTENSION = '.meta';

    } catch (error) {

        Logger.warn(`Could not read metadata for ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        return false;

    } if (options.mirror) {    /**

                }

                return false;            // Mirror mode: Clear directory first     * Pull metaobjects from Shopify store

            });

            Logger.info('Mirror mode: clearing existing metaobjects');     */

        let totalUploaded = 0;

        for (const file of fs.readdirSync(outputPath)) {    static async pull(options: MetaobjectsPullOptions): Promise < void> {

            for(let i = 0; i <files.length; i++) {

                const file = files[i]; if (file.endsWith(this.JSON_EXTENSION) || file.endsWith(this.META_EXTENSION)) {
                    const { site, accessToken } = CredentialResolver.resolve(options);

                    Logger.progress(i + 1, files.length, `Uploading ${file}`);

                    fs.unlinkSync(path.join(outputPath, file));

                    try {

                        const filePath = path.join(inputPath, file);
                    }        const dryRunManager = new DryRunManager(options.dryRun || false);

                    const metaFilePath = filePath + '.meta';

                } dryRunManager.logDryRunHeader(`Pull metaobjects${options.mirror ? ' (Mirror Mode)' : ''}`);

                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                const metadata = yaml.load(fs.readFileSync(metaFilePath, 'utf8')) as MetaobjectMetadata;
            }



            await this.uploadSingleMetaobject(site, accessToken, content, metadata); const outputPath = IOUtility.prepareResourcePath(options.output, 'metaobjects', undefined, dryRunManager.shouldExecute());

            totalUploaded++;

        } catch (error) {        // Process each type        dryRunManager.logAction('pull', `metaobjects${options.type ? ` of type "${options.type}"` : ''} to: ${outputPath}`);

            Logger.error(`Failed to upload ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);

        } for (const type of typesToProcess) {

        }

        Logger.info(`Processing metaobjects of type: ${type}`);        // Fetch available types and metaobjects for summary

        Logger.success(`Successfully pushed ${totalUploaded} metaobjects of type "${options.type}" to ${site}`);

    } const metaobjects = await this.fetchMetaobjects(site, accessToken, type); const types = options.type ? [options.type] : await this.fetchMetaobjectTypes(site, accessToken);



    /**                    let totalCount = 0;

     * Get all metaobject types

     */            if (metaobjects.length > 0) {

    private static async getMetaobjectTypes(site: string, accessToken: string): Promise < string[] > {

            return await RetryUtility.withRetry(async () => {
                await this.downloadMetaobjects(metaobjects, outputPath); for (const type of types) {

                    const query = `

                query GetMetaobjectTypes {                totalDownloaded += metaobjects.length;            const metaobjects = await this.fetchMetaobjects(site, accessToken, type, options.maxMetaobjects);

                    metaobjectDefinitions(first: 250) {

                        nodes {            } else {            totalCount += metaobjects.length;

                            type

                        }                Logger.info(`No metaobjects found for type: ${ type } `);        }

                    }

                }            }

            `;

                } dryRunManager.logSummary({

                    const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {

                        method: 'POST', itemsToSync: totalCount,

                        headers: {

                            'X-Shopify-Access-Token': accessToken, const typeInfo = options.type ? ` of type "${options.type}"` : ''; itemType: 'Metaobjects'

                    'Content-Type': 'application/json',

                        }, Logger.success(`Successfully pulled metaobjects${typeInfo} to ${outputPath} | Downloaded: ${totalDownloaded}`);
                    });

                    body: JSON.stringify({ query })

                });
            }



            if(!response.ok) {
            if (!dryRunManager.shouldExecute()) {

                throw new Error(`Failed to fetch metaobject types: ${response.statusText}`);

            }    /**            return;



            const data = await response.json();     * Push metaobjects to Shopify        }



            if (data.errors) {     */

            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);

        }    static async push(options: MetaobjectOptions = {}): Promise < void> {        // Handle mirror mode - delete local files not in remote



            return data.data.metaobjectDefinitions.nodes.map((def: any) => def.type); if(!options.type) {
                if (options.mirror) {

                }, SHOPIFY_API.RETRY_CONFIG);

        } throw new Error('Type parameter is required for pushing metaobjects. Use --type parameter to specify the metaobject type.'); await this.handleMirrorMode(site, accessToken, outputPath, options.type);



    /**        }        }

     * Fetch metaobjects for a specific type

     */

    private static async fetchMetaobjects(site: string, accessToken: string, type: string, maxCount ?: number): Promise < Metaobject[] > {

            return await RetryUtility.withRetry(async () => {
                const dryRunManager = new DryRunManager(options.dryRun);        // Fetch and download metaobjects

                const query = `

                query GetMetaobjects($type: String!, $first: Int) {        const { site, accessToken } = await CredentialResolver.resolve();        let totalDownloaded = 0;

                    metaobjects(type: $type, first: $first) {

                        nodes {        const inputPath = await IOUtility.prepareResourcePath('metaobjects', options.inputPath);

                            id

                            handle        for (const type of types) {

                            type

                            displayName        dryRunManager.logDryRunHeader(`Push metaobjects${ options.mirror ? ' (Mirror Mode)' : ''
        }`);            const metaobjects = await this.fetchMetaobjects(site, accessToken, type, options.maxMetaobjects);

                            updatedAt

                            fields {        Logger.info(`Site: ${ site } | Input: ${ inputPath } | Type: ${ options.type } `);            await this.downloadMetaobjects(metaobjects, outputPath);

                                key

                                value            totalDownloaded += metaobjects.length;

                                type

                            }        dryRunManager.logAction('push', `metaobjects of type "${options.type}" from: ${ inputPath } `);        }

                        }

                    }

                }

            `; if (dryRunManager.isDryRun) {
            const typeInfo = options.type ? ` of type "${options.type}"` : '';



            const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {
                Logger.info('Dry run completed - no changes were made to Shopify'); Logger.success(`Successfully pulled metaobjects${typeInfo} to ${outputPath} | Downloaded: ${totalDownloaded}`);

                method: 'POST',

                headers: { return; }

                    'X-Shopify-Access-Token': accessToken,

                'Content-Type': 'application/json',
            }

                },

        body: JSON.stringify({    /**

                    query,

                    variables: {        await IOUtility.validateDirectoryPath(inputPath);     * Push metaobjects to Shopify store

                        type,

                        first: maxCount || 250     */

        }

                }) if (options.mirror) {    static async push(options: MetaobjectsPushOptions): Promise < void> {

    });

        // Mirror mode: Delete all remote metaobjects of this type first        const { site, accessToken } = CredentialResolver.resolve(options);

        if (!response.ok) {

            throw new Error(`Failed to fetch metaobjects for type "${type}": ${response.statusText}`); Logger.info(`Mirror mode: deleting all remote metaobjects of type "${options.type}"`);

        }

        const existingMetaobjects = await this.fetchMetaobjects(site, accessToken, options.type); if (!options.type) {

            const data = await response.json();

            for (const metaobject of existingMetaobjects) {
                throw new Error('Type parameter is required for push operations. Specify --type=<metaobject-type>');

                if (data.errors) {

                    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`); await this.deleteMetaobject(site, accessToken, metaobject.id);
                }

            }

            Logger.info(`Deleted metaobject: ${metaobject.handle}`);

            return data.data.metaobjects.nodes;

        }, SHOPIFY_API.RETRY_CONFIG);
    } const inputPath = IOUtility.validateDirectoryPath(options.input);

}

        }        const files = this.collectLocalMetaobjects(inputPath, options.type);

    /**

     * Download metaobjects to local files

     */

    private static async downloadMetaobjects(metaobjects: Metaobject[], outputPath: string): Promise < void> {        // Get all JSON files for this type        const dryRunManager = new DryRunManager(options.dryRun || false);

    for(let i = 0; i <metaobjects.length; i++) {

    const metaobject = metaobjects[i]; const files = fs.readdirSync(inputPath)        dryRunManager.logDryRunHeader(`Push metaobjects${options.mirror ? ' (Mirror Mode)' : ''}`);

    Logger.progress(i + 1, metaobjects.length, `Downloading ${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            .filter(file => file.endsWith(this.JSON_EXTENSION))

    try {

        // Create content object (fields only)            .filter(file => {        dryRunManager.logAction('push', `local metaobjects of type "${options.type}" from "${inputPath}"`);

        const content: { [key: string]: string } = {};

        metaobject.fields.forEach(field => {
            const metaFilePath = path.join(inputPath, file + '.meta');

            content[field.key] = field.value;

        }); if (fs.existsSync(metaFilePath)) {
            let deleteCount = 0;



            // Create metadata object                    try {        if (options.mirror) {

            const metadata: MetaobjectMetadata = {

                id: metaobject.id, const metadata = yaml.load(fs.readFileSync(metaFilePath, 'utf8')) as MetaobjectMetadata; const remoteMetaobjects = await this.fetchMetaobjects(site, accessToken, options.type);

                handle: metaobject.handle,

                type: metaobject.type, return metadata.type === options.type; const localHandles = new Set(files.map(f => f.handle));

                displayName: metaobject.displayName,

                updatedAt: metaobject.updatedAt
            } catch (error) {
                const toDelete = remoteMetaobjects.filter(m => !localHandles.has(m.handle));

            };

            Logger.warn(`Could not read metadata for ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`); deleteCount = toDelete.length;

            const filePath = path.join(outputPath, `${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            const metaFilePath = filePath + '.meta'; return false;
        }



        // Write content file                    }

        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

    }        dryRunManager.logSummary({

        // Write metadata file

        fs.writeFileSync(metaFilePath, yaml.dump(metadata)); return false; itemsToUpload: files.length,



    } catch (error) { }); itemsToDelete: deleteCount > 0 ? deleteCount : undefined,

        Logger.error(`Failed to download metaobject ${metaobject.handle}: ${error instanceof Error ? error.message : 'Unknown error'}`);

} itemType: 'Metaobjects'

        }

    }        let totalUploaded = 0;        });



    /**

     * Upload a single metaobject

     */        for (let i = 0; i < files.length; i++) {
    if (!dryRunManager.shouldExecute()) {

    private static async uploadSingleMetaobject(site: string, accessToken: string, content: any, metadata: MetaobjectMetadata): Promise < void> {

            return await RetryUtility.withRetry(async () => {
                const file = files[i]; return;

                // Convert content object to fields array

                const fields = Object.entries(content).map(([key, value]) => ({ Logger.progress(i + 1, files.length, `Uploading ${file}`); }

                key,

                    value: String(value)

            }));

            try {
                Logger.info(`Push local metaobjects of type "${options.type}" from "${inputPath}"`);

                const mutation = `

                mutation MetaobjectUpsert($metaobject: MetaobjectUpsertInput!) {                const filePath = path.join(inputPath, file);        Logger.info(`Found ${ files.length } local metaobjects to upload`);

                    metaobjectUpsert(metaobject: $metaobject) {

                        metaobject {                const metaFilePath = filePath + '.meta';

                            id

                            handle        // Upload metaobjects

                        }

                        userErrors {                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));        const uploadResults = await this.uploadMetaobjects(site, accessToken, files);

                            field

                            message                const metadata = yaml.load(fs.readFileSync(metaFilePath, 'utf8')) as MetaobjectMetadata;

                        }

                    }        // Handle mirror mode - delete remote metaobjects not in local files

                }

            `; await this.uploadSingleMetaobject(site, accessToken, content, metadata); let deleteResults = { deleted: 0, failed: 0, errors: [] as string[] };



        const variables = { totalUploaded++; if (options.mirror) {

            metaobject: {

                type: metadata.type,            } catch (error) {
                    const remoteMetaobjects = await this.fetchMetaobjects(site, accessToken, options.type);

                    handle: metadata.handle,

                        fields                Logger.error(`Failed to upload ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`); const localHandles = new Set(files.map(f => f.handle));

                }

        };
    } const toDelete = remoteMetaobjects.filter(m => !localHandles.has(m.handle));



    // If we have an existing ID, include it for update        }

    if (metadata.id) {

        variables.metaobject.id = metadata.id; if (toDelete.length > 0) {

        }

        Logger.success(`Successfully pushed ${totalUploaded} metaobjects of type "${options.type}" to ${site}`); deleteResults = await this.deleteMetaobjects(site, accessToken, toDelete);

        const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {

            method: 'POST',
        }            }

    headers: {

        'X-Shopify-Access-Token': accessToken,        }

    'Content-Type': 'application/json',

                },    /**

                body: JSON.stringify({

                    query: mutation,     * Get all metaobject types        // Report results

                    variables

                })     */        const totalOperations = uploadResults.uploaded + uploadResults.failed + deleteResults.deleted + deleteResults.failed;

            });

    private static async getMetaobjectTypes(site: string, accessToken: string): Promise < string[] > {

    if(!response.ok) {

    throw new Error(`Failed to upsert metaobject "${metadata.handle}": ${response.statusText}`); return await RetryUtility.withRetry(async () => {
        if (uploadResults.failed > 0 || deleteResults.failed > 0) {

        }

        const query = `            Logger.error('');

            const data = await response.json();

                query GetMetaobjectTypes {            Logger.error('Upload failures encountered:');

            if (data.errors) {

                throw new Error(`GraphQL errors: ${ JSON.stringify(data.errors)
    }`);                    metaobjectDefinitions(first: 250) {            uploadResults.errors.forEach(error => Logger.error(` - ${ error }`));

            }

                        nodes {            deleteResults.errors.forEach(error => Logger.error(`  - ${ error }`));

            if (data.data.metaobjectUpsert.userErrors.length > 0) {

                throw new Error(`Metaobject upsert errors: ${ JSON.stringify(data.data.metaobjectUpsert.userErrors) }`);                            type

            }

                        }            throw new Error(`Push failed: ${ uploadResults.failed + deleteResults.failed } operation(s) failed.See above for details.`);

        }, SHOPIFY_API.RETRY_CONFIG);

    }                    }        }



    /**                }

     * Delete a metaobject

     */            `;        const successParts = [];

    private static async deleteMetaobject(site: string, accessToken: string, id: string): Promise < void> {

        return await RetryUtility.withRetry(async () => {
            if (uploadResults.uploaded > 0) successParts.push(`Uploaded: ${uploadResults.uploaded}`);

            const mutation = `

                mutation MetaobjectDelete($id: ID!) {            const response = await fetch(`${ SHOPIFY_API.BASE_URL(site)
    } / ${ SHOPIFY_API.VERSION }/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {        if (deleteResults.deleted > 0) successParts.push(`Deleted: ${deleteResults.deleted}`);

    metaobjectDelete(id: $id) {

                        deletedId                method: 'POST',

            userErrors {

                            field                headers: {
                Logger.success(`Successfully pushed metaobjects${successParts.length > 0 ? ` | ${successParts.join(' | ')}` : ''}`);

                message

            } 'X-Shopify-Access-Token': accessToken,    }

    }

} 'Content-Type': 'application/json',

    `;

                },    /**

            const response = await fetch(`${ SHOPIFY_API.BASE_URL(site) } /${SHOPIFY_API.VERSION}/${ SHOPIFY_API.ENDPOINTS.GRAPHQL } `, {

                method: 'POST',                body: JSON.stringify({ query })     * Fetch available metaobject types

                headers: {

                    'X-Shopify-Access-Token': accessToken,            });     */

                    'Content-Type': 'application/json',

                },    private static async fetchMetaobjectTypes(site: string, accessToken: string): Promise<string[]> {

                body: JSON.stringify({

                    query: mutation,            if (!response.ok) {        return await RetryUtility.withRetry(async () => {

                    variables: { id }

                })                throw new Error(`Failed to fetch metaobject types: ${ response.statusText } `);            const query = `

            });

            }                query GetMetaobjectDefinitions {

    if (!response.ok) {

        throw new Error(`Failed to delete metaobject: ${response.statusText}`); metaobjectDefinitions(first: 250) {

        }

        const data = await response.json();                        nodes {

            const data = await response.json();

            type

            if (data.errors) {

                throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`); if (data.errors) { }

            }

            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        if (data.data.metaobjectDelete.userErrors.length > 0) {

            throw new Error(`Metaobject delete errors: ${JSON.stringify(data.data.metaobjectDelete.userErrors)}`);
        }
    }

}

`;

        }, SHOPIFY_API.RETRY_CONFIG);

    }            return data.data.metaobjectDefinitions.nodes.map((def: any) => def.type);

}

        }, SHOPIFY_API.RETRY_CONFIG);            const response = await fetch(`${ SHOPIFY_API.BASE_URL(site) } /${SHOPIFY_API.VERSION}/${ SHOPIFY_API.ENDPOINTS.GRAPHQL } `, {

/**

 * Pull metaobjects command wrapper    }                method: 'POST',

 */

export async function pullMetaobjectsCommand(options: MetaobjectOptions): Promise<void> {                headers: {

    await ShopifyMetaobjects.pull(options);

}    /**                    'X-Shopify-Access-Token': accessToken,



/**     * Fetch metaobjects for a specific type                    'Content-Type': 'application/json',

 * Push metaobjects command wrapper

 */     */                },

export async function pushMetaobjectsCommand(options: MetaobjectOptions): Promise<void> {

    await ShopifyMetaobjects.push(options);    private static async fetchMetaobjects(site: string, accessToken: string, type: string, maxCount?: number): Promise<Metaobject[]> {                body: JSON.stringify({ query })

}
        return await RetryUtility.withRetry(async () => {            });

            const query = `

                query GetMetaobjects($type: String!, $first: Int) {
    if (!response.ok) {

        metaobjects(type: $type, first: $first) {
            throw new Error(`Failed to fetch metaobject types: ${response.statusText}`);

                        nodes { }

            id

                            handle            const data = await response.json();

            type

                            displayName            if (data.errors) {

                            updatedAt                throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);

                            fields { }

                key

                                value            return data.data.metaobjectDefinitions.nodes.map((def: any) => def.type);

                type
            }, SHOPIFY_API.RETRY_CONFIG);

        }
    }

}

                    }    /**

                }     * Fetch metaobjects for a specific type

            `;     */

    private static async fetchMetaobjects(site: string, accessToken: string, type: string, maxCount ?: number): Promise < Metaobject[] > {

    const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {
        return await RetryUtility.withRetry(async () => {

            method: 'POST',            const query = `

                headers: {                query GetMetaobjects($type: String!, $first: Int) {

                    'X-Shopify-Access-Token': accessToken,                    metaobjects(type: $type, first: $first) {

                    'Content-Type': 'application/json',                        nodes {

                },                            id

                body: JSON.stringify({                            handle

                    query,                            type

                    variables: {                            displayName

                        type,                            createdAt

                        first: maxCount || 250                            updatedAt

                    }                            fields {

                })                                key

            });                                value

                                type

            if (!response.ok) {                            }

                throw new Error(`Failed to fetch metaobjects for type "${type}": ${ response.statusText } `);                        }

            }                    }

                }

            const data = await response.json();            `;



            if (data.errors) {
                const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {

                    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`); method: 'POST',

                }                headers: {

                    'X-Shopify-Access-Token': accessToken,

                    return data.data.metaobjects.nodes; 'Content-Type': 'application/json',

                }, SHOPIFY_API.RETRY_CONFIG);
            },

        }                body: JSON.stringify({

            query,

    /**                    variables: {

     * Download metaobjects to local files                        type,

     */                        first: maxCount || 250

    private static async downloadMetaobjects(metaobjects: Metaobject[], outputPath: string): Promise<void> { }

        for(let i = 0; i<metaobjects.length; i++) {})

            const metaobject = metaobjects[i];
    });

    Logger.progress(i + 1, metaobjects.length, `Downloading ${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

    if(!response.ok) {

    try {
        throw new Error(`Failed to fetch metaobjects for type "${type}": ${response.statusText}`);

        // Create content object (fields only)            }

        const content: { [key: string]: string } = {};

        metaobject.fields.forEach(field => {
            const data = await response.json();

            content[field.key] = field.value;

        }); if (data.errors) {

            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);

            // Create metadata object            }

            const metadata: MetaobjectMetadata = {

                id: metaobject.id, return data.data.metaobjects.nodes;

                handle: metaobject.handle,
            }, SHOPIFY_API.RETRY_CONFIG);

            type: metaobject.type,    }

        displayName: metaobject.displayName,

            updatedAt: metaobject.updatedAt    /**

                };     * Download metaobjects to local files

     */

        const filePath = path.join(outputPath, `${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);    private static async downloadMetaobjects(metaobjects: Metaobject[], outputPath: string): Promise < void> {

            const metaFilePath = filePath + '.meta'; for(let i = 0; i <metaobjects.length; i++) {

            const metaobject = metaobjects[i];

            // Write content file            Logger.progress(i + 1, metaobjects.length, `Downloading ${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

            try {

                // Write metadata file                await RetryUtility.withRetry(

                fs.writeFileSync(metaFilePath, yaml.dump(metadata)); () => this.downloadSingleMetaobject(metaobject, outputPath),

                    SHOPIFY_API.RETRY_CONFIG

            } catch (error) {                );

                Logger.error(`Failed to download metaobject ${metaobject.handle}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            } catch (error) {

            } const message = error instanceof Error ? error.message : String(error);

        } Logger.warn(`Failed to download ${metaobject.handle}: ${message}`);

    }            }

        }

/**    }

 * Upload a single metaobject

 */    /**

private static async uploadSingleMetaobject(site: string, accessToken: string, content: any, metadata: MetaobjectMetadata): Promise<void> {     * Download a single metaobject

   return await RetryUtility.withRetry(async () => {     */

// Convert content object to fields array    private static async downloadSingleMetaobject(metaobject: Metaobject, outputPath: string): Promise<void> {

const fields = Object.entries(content).map(([key, value]) => ({
    const filename = `${metaobject.handle}${ShopifyMetaobjects.JSON_EXTENSION}`;

    key, const filePath = path.join(outputPath, filename);

    value: String(value)        const metaFilePath = `${filePath}${ShopifyMetaobjects.META_EXTENSION}`;

}));

// Create content with just the fields for the main file

const mutation = `        const content = {

                mutation MetaobjectUpsert($metaobject: MetaobjectUpsertInput!) {            type: metaobject.type,

                    metaobjectUpsert(metaobject: $metaobject) {            displayName: metaobject.displayName,

                        metaobject {            fields: metaobject.fields

                            id        };

                            handle

                        }        // Create metadata file

                        userErrors {        const metadata: MetaobjectMetadata = {

                            field            id: metaobject.id,

                            message            handle: metaobject.handle,

                        }            type: metaobject.type,

                    }            displayName: metaobject.displayName,

                }            createdAt: metaobject.createdAt,

            `; updatedAt: metaobject.updatedAt

        };

const variables = {

    metaobject: {
        fs.writeFileSync(filePath, JSON.stringify(content, null, 2));

        type: metadata.type, fs.writeFileSync(metaFilePath, yaml.dump(metadata));

        handle: metadata.handle,
    }

                    fields

}    /**

            };     * Collect local metaobject files

     */

// If we have an existing ID, include it for update    private static collectLocalMetaobjects(inputPath: string, type: string): Array<{ handle: string, filePath: string, metaobjectId?: string, metadata?: MetaobjectMetadata }> {

if (metadata.id) {
    if (!fs.existsSync(inputPath)) {

        variables.metaobject.id = metadata.id; throw new Error(`Input directory does not exist: ${inputPath}`);

    }
}



const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, { const files: Array<{ handle: string, filePath: string, metaobjectId ?: string, metadata ?: MetaobjectMetadata }> =[];

method: 'POST',        const entries = fs.readdirSync(inputPath);

headers: {

    'X-Shopify-Access-Token': accessToken, entries.forEach(entry => {

        'Content-Type': 'application/json',            if (entry.endsWith(ShopifyMetaobjects.JSON_EXTENSION) && !entry.endsWith(ShopifyMetaobjects.META_EXTENSION)) {

        }, const filePath = path.join(inputPath, entry);

        body: JSON.stringify({
            const metaFilePath = `${filePath}${ShopifyMetaobjects.META_EXTENSION}`;

            query: mutation, const handle = path.basename(entry, ShopifyMetaobjects.JSON_EXTENSION);

            variables

        })                let metadata: MetaobjectMetadata | undefined;

    }); if (fs.existsSync(metaFilePath)) {

        try {

            if (!response.ok) {
                const metaContent = fs.readFileSync(metaFilePath, 'utf8');

                throw new Error(`Failed to upsert metaobject "${metadata.handle}": ${response.statusText}`); metadata = yaml.load(metaContent) as MetaobjectMetadata;

            }
        } catch (error) {

            Logger.warn(`Failed to read metadata for ${handle}: ${error}`);

            const data = await response.json();
        }

    }

    if (data.errors) {

        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);                // Verify the metaobject is of the correct type

    } try {

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        if (data.data.metaobjectUpsert.userErrors.length > 0) {
            if (content.type === type) {

                throw new Error(`Metaobject upsert errors: ${JSON.stringify(data.data.metaobjectUpsert.userErrors)}`); files.push({

                }                            handle,

                    filePath,

        }, SHOPIFY_API.RETRY_CONFIG); metaobjectId: metadata?.id,

    } metadata

    });

    /**                    }

     * Delete a metaobject                } catch (error) {

     */                    Logger.warn(`Failed to read metaobject file ${entry}: ${error}`);

    private static async deleteMetaobject(site: string, accessToken: string, id: string): Promise < void> {}

    return await RetryUtility.withRetry(async () => { }

            const mutation = `        });

                mutation MetaobjectDelete($id: ID!) {

                    metaobjectDelete(id: $id) {        return files;

                        deletedId    }

                        userErrors {

                            field    /**

                            message     * Upload metaobjects to Shopify

                        }     */

                    }    private static async uploadMetaobjects(site: string, accessToken: string, files: Array<{ handle: string, filePath: string, metaobjectId?: string, metadata?: MetaobjectMetadata }>): Promise<{ uploaded: number, failed: number, errors: string[] }> {

                }        const result = { uploaded: 0, failed: 0, errors: [] as string[] };

            `;

    for (let i = 0; i < files.length; i++) {

        const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {
            const file = files[i];

            method: 'POST', Logger.progress(i + 1, files.length, `Uploading ${file.handle}${ShopifyMetaobjects.JSON_EXTENSION}`);

            headers: {

                'X-Shopify-Access-Token': accessToken, try {

                    'Content-Type': 'application/json', await RetryUtility.withRetry(

                },                    () => this.uploadSingleMetaobject(site, accessToken, file),

            body: JSON.stringify({
                SHOPIFY_API.RETRY_CONFIG

                    query: mutation,                );

        variables: { id } result.uploaded++;

    })
} catch (error) {

}); const message = error instanceof Error ? error.message : String(error);

Logger.error(`Failed to upload ${file.handle}: ${message}`);

if (!response.ok) {
    result.failed++;

    throw new Error(`Failed to delete metaobject: ${response.statusText}`); result.errors.push(`${file.handle}: ${message}`);

}            }

        }

const data = await response.json();

return result;

if (data.errors) { }

throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);

            }    /**

     * Upload a single metaobject

            if (data.data.metaobjectDelete.userErrors.length > 0) {     */

throw new Error(`Metaobject delete errors: ${JSON.stringify(data.data.metaobjectDelete.userErrors)}`);    private static async uploadSingleMetaobject(site: string, accessToken: string, file: { handle: string, filePath: string, metaobjectId?: string, metadata?: MetaobjectMetadata }): Promise < void> {

}        const content = JSON.parse(fs.readFileSync(file.filePath, 'utf8'));



        }, SHOPIFY_API.RETRY_CONFIG); const mutation = `

    }            mutation UpsertMetaobject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {

}                metaobjectUpsert(handle: $handle, metaobject: $metaobject) {

                    metaobject {

/**                        id

 * Pull metaobjects command wrapper                        handle

 */                        displayName

export async function pullMetaobjectsCommand(options: MetaobjectOptions): Promise<void> {                    }

    await ShopifyMetaobjects.pull(options);                    userErrors {

}                        field

                        message

/**                        code

 * Push metaobjects command wrapper                    }

 */                }

export async function pushMetaobjectsCommand(options: MetaobjectOptions): Promise<void> {            }

    await ShopifyMetaobjects.push(options);        `;

}
const variables = {
    handle: {
        type: content.type,
        handle: file.handle
    },
    metaobject: {
        fields: content.fields
    }
};

const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {
    method: 'POST',
    headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mutation, variables })
});

if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${await response.text()}`);
}

const data = await response.json();

if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
}

if (data.data.metaobjectUpsert.userErrors && data.data.metaobjectUpsert.userErrors.length > 0) {
    const errors = data.data.metaobjectUpsert.userErrors.map((err: any) => err.message).join(', ');
    throw new Error(`User errors: ${errors}`);
}
    }

    /**
     * Delete metaobjects from Shopify
     */
    private static async deleteMetaobjects(site: string, accessToken: string, metaobjects: Metaobject[]): Promise < { deleted: number, failed: number, errors: string[] } > {
    const result = { deleted: 0, failed: 0, errors: [] as string[] };

    for(let i = 0; i <metaobjects.length; i++) {
    const metaobject = metaobjects[i];
    Logger.progress(i + 1, metaobjects.length, `Deleting ${metaobject.handle}`);

    try {
        // RetryUtility.withRetry now handles both retry logic AND rate limiting automatically
        await RetryUtility.withRetry(
            () => this.deleteSingleMetaobject(site, accessToken, metaobject),
            SHOPIFY_API.RETRY_CONFIG
        );
        result.deleted++;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.warn(`Failed to delete ${metaobject.handle}: ${message}`);
        result.failed++;
        result.errors.push(`${metaobject.handle}: ${message}`);
    }
}

return result;
    }

    /**
     * Delete a single metaobject
     */
    private static async deleteSingleMetaobject(site: string, accessToken: string, metaobject: Metaobject): Promise < void> {
    return await RetryUtility.withRetry(async () => {
        const mutation = `
                mutation DeleteMetaobject($id: ID!) {
                    metaobjectDelete(id: $id) {
                        deletedId
                        userErrors {
                            field
                            message
                            code
                        }
                    }
                }
            `;

        const response = await fetch(`${SHOPIFY_API.BASE_URL(site)}/${SHOPIFY_API.VERSION}/${SHOPIFY_API.ENDPOINTS.GRAPHQL}`, {
            method: 'POST',
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: mutation,
                variables: { id: metaobject.id }
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed (${response.status}): ${await response.text()}`);
        }

        const data = await response.json();

        if (data.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        }

        if (data.data.metaobjectDelete.userErrors && data.data.metaobjectDelete.userErrors.length > 0) {
            const errors = data.data.metaobjectDelete.userErrors.map((err: any) => err.message).join(', ');
            throw new Error(`User errors: ${errors}`);
        }
    }, SHOPIFY_API.RETRY_CONFIG);
}

    /**
     * Handle mirror mode by deleting local files not in remote
     */
    private static async handleMirrorMode(site: string, accessToken: string, outputPath: string, type ?: string): Promise < void> {
    const types = type ? [type] : await this.fetchMetaobjectTypes(site, accessToken);
    const remoteHandles = new Set<string>();

    // Collect all remote handles
    for(const currentType of types) {
        const metaobjects = await this.fetchMetaobjects(site, accessToken, currentType);
        metaobjects.forEach(m => remoteHandles.add(m.handle));
    }

        // Find local files to delete
        if(!fs.existsSync(outputPath)) {
    return;
}

const entries = fs.readdirSync(outputPath);
const localFiles = entries.filter(entry =>
    entry.endsWith(ShopifyMetaobjects.JSON_EXTENSION) &&
    !entry.endsWith(ShopifyMetaobjects.META_EXTENSION)
);

const filesToDelete = localFiles.filter(file => {
    const handle = path.basename(file, ShopifyMetaobjects.JSON_EXTENSION);
    return !remoteHandles.has(handle);
});

if (filesToDelete.length > 0) {
    Logger.info(`Mirror mode: ${filesToDelete.length} local files will be deleted`);

    filesToDelete.forEach(file => {
        const filePath = path.join(outputPath, file);
        const metaFile = `${filePath}${ShopifyMetaobjects.META_EXTENSION}`;

        fs.unlinkSync(filePath);
        Logger.info(`Deleted local file: ${file}`);

        if (fs.existsSync(metaFile)) {
            fs.unlinkSync(metaFile);
            Logger.info(`Deleted metadata: ${file}${ShopifyMetaobjects.META_EXTENSION}`);
        }
    });
}
    }


}

/**
 * Command wrapper for CLI integration - Pull metaobjects
 */
export async function metaobjectsPullCommand(options: MetaobjectsPullOptions): Promise<void> {
    try {
        await ShopifyMetaobjects.pull(options);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to pull metaobjects: ${message}`);
        process.exit(1);
    }
}

/**
 * Command wrapper for CLI integration - Push metaobjects
 */
export async function metaobjectsPushCommand(options: MetaobjectsPushOptions): Promise<void> {
    try {
        await ShopifyMetaobjects.push(options);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`Failed to push metaobjects: ${message}`);
        process.exit(1);
    }
}