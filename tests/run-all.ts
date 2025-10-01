/**
 * Test Runner
 * 
 * Runs all test files and aggregates results
 */

import { spawn } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

const testDir = __dirname;
const testFiles = readdirSync(testDir)
    .filter(file => file.endsWith('.test.ts'))
    .map(file => join(testDir, file));

let failedTests = 0;
let passedTests = 0;

async function runTest(file: string): Promise<boolean> {
    return new Promise((resolve) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`Running: ${file.replace(testDir + '/', '')}`);
        console.log('='.repeat(80));

        const proc = spawn('npx', ['ts-node', file], {
            stdio: 'inherit',
            shell: true
        });

        proc.on('close', (code) => {
            if (code === 0) {
                passedTests++;
                resolve(true);
            } else {
                failedTests++;
                resolve(false);
            }
        });
    });
}

async function runAllTests() {
    console.log(`Found ${testFiles.length} test files\n`);

    for (const file of testFiles) {
        await runTest(file);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total test files: ${testFiles.length}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log('='.repeat(80));

    if (failedTests > 0) {
        console.error(`\n❌ ${failedTests} test file(s) failed`);
        process.exit(1);
    } else {
        console.log(`\n✅ All test files passed`);
        process.exit(0);
    }
}

runAllTests();
