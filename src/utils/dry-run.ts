import { Logger } from './logger';

export interface DryRunStats {
    itemsToSync?: number;
    itemsToUpload?: number;
    itemsToDelete?: number;
    deleteList?: string[];
    itemType?: string;
}

export class DryRunManager {
    constructor(private isDryRun: boolean) { }

    logDryRunHeader(operation: string): void {
        if (this.isDryRun) {
            Logger.info(`\n=== DRY RUN MODE ===`);
            Logger.info(`Operation: ${operation}`);
            Logger.info(`No changes will be made to the store\n`);
        }
    }

    get isActive(): boolean {
        return this.isDryRun;
    }

    shouldExecute(): boolean {
        return !this.isDryRun;
    }

    logAction(action: string, target: string): void {
        const verb = this.isDryRun ? `Would ${action}` : `${action.charAt(0).toUpperCase() + action.slice(1)}`;
        Logger.info(`${verb} ${target}`);
    }

    logSummary(stats: DryRunStats): void {
        if (!this.isDryRun) {
            return;
        }

        Logger.info('\nDRY RUN SUMMARY:');

        if (stats.itemsToSync !== undefined) {
            Logger.info(`${stats.itemType || 'Items'} to sync: ${stats.itemsToSync}`);
        }

        if (stats.itemsToUpload !== undefined) {
            Logger.info(`${stats.itemType || 'Items'} to upload: ${stats.itemsToUpload}`);
        }

        if (stats.itemsToDelete !== undefined && stats.itemsToDelete > 0) {
            Logger.info(`${stats.itemType || 'Items'} to delete: ${stats.itemsToDelete}`);

            if (stats.deleteList && stats.deleteList.length > 0) {
                stats.deleteList.slice(0, 10).forEach((item: string) => Logger.info(`  - ${item}`));
                if (stats.deleteList.length > 10) {
                    Logger.info(`  ... and ${stats.deleteList.length - 10} more ${(stats.itemType || 'items').toLowerCase()}`);
                }
            }
        }
    }
}
