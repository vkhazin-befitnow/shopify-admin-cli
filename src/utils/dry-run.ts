export class DryRunManager {
    constructor(private isDryRun: boolean) { }

    async executeWithDryRun<T>(
        operation: string,
        action: () => Promise<T>,
        previewData?: any
    ): Promise<T | null> {
        if (this.isDryRun) {
            console.log(`DRY RUN: Would execute ${operation}`);
            if (previewData) {
                console.log(JSON.stringify(previewData, null, 2));
            }
            return null;
        }
        return await action();
    }

    logDryRunHeader(operation: string): void {
        if (this.isDryRun) {
            console.log(`\n=== DRY RUN MODE ===`);
            console.log(`Operation: ${operation}`);
            console.log(`No changes will be made to the store\n`);
        }
    }

    logDryRunSummary(summary: {
        toUpload: any[];
        toUpdate: any[];
        toDelete?: any[];
    }): void {
        if (!this.isDryRun) return;

        console.log(`\n--- Changes Summary ---`);
        console.log(`Files to upload (new): ${summary.toUpload.length}`);
        console.log(`Files to update (modified): ${summary.toUpdate.length}`);
        if (summary.toDelete) {
            console.log(`Files to delete (removed): ${summary.toDelete.length}`);
        }

        if (summary.toUpload.length > 0) {
            console.log(`\nNew files:`);
            summary.toUpload.forEach(file => console.log(`  + ${file.key}`));
        }

        if (summary.toUpdate.length > 0) {
            console.log(`\nModified files:`);
            summary.toUpdate.forEach(file => console.log(`  ~ ${file.key}`));
        }

        if (summary.toDelete && summary.toDelete.length > 0) {
            console.log(`\nFiles to delete:`);
            summary.toDelete.forEach(file => console.log(`  - ${file.key}`));
        }

        console.log(`\nTo apply these changes, run the same command without --dry-run`);
    }

    get isActive(): boolean {
        return this.isDryRun;
    }
}