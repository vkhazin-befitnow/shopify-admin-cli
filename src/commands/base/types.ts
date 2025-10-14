/**
 * Common types for base resource command implementation
 */

export interface PullOptions {
    output: string;
    site: string;
    accessToken: string;
    maxItems?: number;
    dryRun?: boolean;
    mirror?: boolean;
}

export interface PushOptions {
    input: string;
    site: string;
    accessToken: string;
    dryRun?: boolean;
    mirror?: boolean;
}

export interface LocalFile<TMetadata> {
    handle: string;
    filePath: string;
    metadata?: TMetadata;
}

export interface BatchResult {
    processed: number;
    failed: number;
    errors: string[];
}

export interface BatchOperation<T> {
    execute: (item: T) => Promise<void>;
    getItemName: (item: T) => string;
    operationName: string;
}