export class DryRunManager {
    constructor(private isDryRun: boolean) { }

    logDryRunHeader(operation: string): void {
        if (this.isDryRun) {
            console.log(`\n=== DRY RUN MODE ===`);
            console.log(`Operation: ${operation}`);
            console.log(`No changes will be made to the store\n`);
        }
    }

    get isActive(): boolean {
        return this.isDryRun;
    }
}
